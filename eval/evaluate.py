"""
Offline evaluation for Ambit's recommender.

A recommender nobody measured is a demo, not a system. This answers one
question: does the four-dial scoring model actually beat something trivial?

    python eval/evaluate.py

The bar that matters is not the random baseline — beating random is easy and
proves nothing. It is the TEMPO-ONLY baseline. If matching BPM alone does as
well as four weighted dials plus a veto plus a penalty, then the extra machinery
is decoration and should be cut. Publishing a metric that could embarrass the
model is the entire point; a benchmark you cannot fail is marketing.

Labels live in eval/labels.json:

    [{"mood": "deep-focus", "track_id": "jam123", "fits": true}, ...]

Generate a labelling worksheet with:

    python eval/evaluate.py --make-labels 200
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
TRACKS = ROOT / "public" / "tracks.json"
LABELS = ROOT / "eval" / "labels.json"

DIALS = ("energy", "warmth", "pace", "vocals")
FIELD = {"energy": "e", "warmth": "w", "pace": "t", "vocals": "v"}

# Kept in sync with lib/scoring.ts and lib/moods.ts by hand. If they drift, this
# harness is measuring something the app doesn't do — check them together.
WEIGHTS = {"energy": 1.15, "warmth": 0.8, "pace": 1.1, "vocals": 0.75}
PENALTY_THRESHOLD, PENALTY_RATE, VETO_THRESHOLD = 30, 0.6, 45

MOODS: dict[str, dict[str, Any]] = {
    "deep-focus":       {"dials": {"energy": 34, "warmth": 52, "pace": 40, "vocals": 12}, "critical": "vocals"},
    "late-night-drive": {"dials": {"energy": 62, "warmth": 38, "pace": 62, "vocals": 34}, "critical": None},
    "sunday-morning":   {"dials": {"energy": 30, "warmth": 84, "pace": 36, "vocals": 62}, "critical": "warmth"},
    "gym-push":         {"dials": {"energy": 94, "warmth": 30, "pace": 88, "vocals": 58}, "critical": "energy"},
    "rainy-commute":    {"dials": {"energy": 44, "warmth": 60, "pace": 46, "vocals": 48}, "critical": None},
    "dinner-party":     {"dials": {"energy": 52, "warmth": 76, "pace": 54, "vocals": 54}, "critical": None},
    "long-haul-flight": {"dials": {"energy": 26, "warmth": 46, "pace": 30, "vocals": 20}, "critical": "energy"},
    "reset-after-work": {"dials": {"energy": 38, "warmth": 68, "pace": 42, "vocals": 44}, "critical": None},
}


# --- the models under test --------------------------------------------------

def score_full(track: dict, mood: dict) -> float:
    """The real model: weighted distance + single-dial penalty + critical veto."""
    dials = mood["dials"]
    gaps = {k: track[FIELD[k]] - dials[k] for k in DIALS}
    weighted = sum(abs(gaps[k]) * WEIGHTS[k] for k in DIALS)
    mean = weighted / sum(WEIGHTS.values())
    worst = max(abs(gaps[k]) for k in DIALS)
    penalty = (worst - PENALTY_THRESHOLD) * PENALTY_RATE if worst > PENALTY_THRESHOLD else 0
    score = max(0, 100 - mean - penalty)
    crit = mood.get("critical")
    if crit and abs(gaps[crit]) > VETO_THRESHOLD:
        score = min(score, 35)
    return score


def score_unweighted(track: dict, mood: dict) -> float:
    """Ablation: plain mean distance, no weights, no penalty, no veto."""
    dials = mood["dials"]
    return 100 - sum(abs(track[FIELD[k]] - dials[k]) for k in DIALS) / len(DIALS)


def score_no_veto(track: dict, mood: dict) -> float:
    """Ablation: everything except the critical-dial veto."""
    return score_full(track, {**mood, "critical": None})


def score_tempo_only(track: dict, mood: dict) -> float:
    """The baseline that matters. One dial, nothing else."""
    return 100 - abs(track[FIELD["pace"]] - mood["dials"]["pace"])


def score_random(track: dict, mood: dict) -> float:
    return random.random() * 100


MODELS = {
    "full model": score_full,
    "no veto": score_no_veto,
    "unweighted mean": score_unweighted,
    "tempo only": score_tempo_only,
    "random": score_random,
}


# --- metrics ----------------------------------------------------------------

def precision_at_k(ranked: list[dict], labels: dict[str, bool], k: int) -> float | None:
    """
    Fraction of the top k that were labelled a fit.

    Only labelled tracks count. An unlabelled track in the top k is not evidence
    either way, and silently treating it as a miss would punish whichever model
    surfaces tracks the labeller never saw.
    """
    judged = [t for t in ranked if t["id"] in labels][:k]
    if not judged:
        return None
    return sum(1 for t in judged if labels[t["id"]]) / len(judged)


def evaluate(tracks: list[dict], labels_raw: list[dict], k: int = 6) -> dict:
    by_mood: dict[str, dict[str, bool]] = {}
    for row in labels_raw:
        by_mood.setdefault(row["mood"], {})[row["track_id"]] = bool(row["fits"])

    results: dict[str, dict] = {}
    for name, fn in MODELS.items():
        per_mood, coverage = [], []
        for mood_id, labels in by_mood.items():
            mood = MOODS.get(mood_id)
            if not mood:
                continue
            ranked = sorted(tracks, key=lambda t: fn(t, mood), reverse=True)
            p = precision_at_k(ranked, labels, k)
            if p is not None:
                per_mood.append((mood_id, p))
                # how many of the top-k were actually judged — a P@6 backed by
                # 3 labelled tracks is not the same evidence as one backed by 6
                coverage.append(min(k, len([t for t in ranked if t["id"] in labels])))
        mean = sum(p for _, p in per_mood) / len(per_mood) if per_mood else 0.0
        results[name] = {
            "mean_precision": mean,
            "per_mood": dict(per_mood),
            "moods_evaluated": len(per_mood),
            "labels_used": sum(coverage),
            "judged_per_mood": (sum(coverage) / len(coverage)) if coverage else 0,
        }
    return results


def report(results: dict, k: int) -> None:
    print(f"\n  precision@{k}, averaged over moods\n")
    print(f"  {'model':<20} {'P@' + str(k):>7}   {'vs random':>10}")
    print("  " + "-" * 44)

    base = results.get("random", {}).get("mean_precision", 0) or 1e-9
    for name, r in sorted(results.items(), key=lambda kv: -kv[1]["mean_precision"]):
        lift = r["mean_precision"] / base
        print(f"  {name:<20} {r['mean_precision']:>7.3f}   {lift:>9.2f}x")

    full = results.get("full model", {}).get("mean_precision", 0)
    tempo = results.get("tempo only", {}).get("mean_precision", 0)
    veto = results.get("no veto", {}).get("mean_precision", 0)

    print("\n  what this says:")
    if full <= tempo:
        print("  * The full model does NOT beat matching tempo alone. The extra")
        print("    dials are not earning their place — either the signals are")
        print("    weak (check the vocals proxy) or the weights are wrong.")
    else:
        print(f"  * Four dials beat tempo alone by {full - tempo:+.3f}.")
    if full <= veto:
        print("  * The veto is not helping. Consider removing it.")
    else:
        print(f"  * The critical-dial veto adds {full - veto:+.3f}.")

    fm = results.get("full model", {})
    n = fm.get("labels_used", 0)
    per = fm.get("judged_per_mood", 0)
    print(f"\n  evidence: {n} judged slots across {fm.get('moods_evaluated', 0)} moods "
          f"({per:.1f} per mood)")
    if per < k:
        print(f"  * Each P@{k} rests on fewer than {k} judged tracks. Label more "
              "per mood\n    before trusting a gap this small.")
    if n < 150:
        print("  * Under 150 judged slots overall — directional only.")
    gap = abs(full - tempo)
    if gap < 0.05:
        print("  * The gap to the tempo baseline is inside the noise for this "
              "sample\n    size. Do not claim the model wins yet.")


# --- labelling worksheet ----------------------------------------------------

def make_labels(tracks: list[dict], n: int, out: Path) -> None:
    """
    Build a stratified worksheet to fill in by hand.

    Sampling is deliberately NOT top-ranked-only. Labelling just what the model
    already likes measures nothing — you need tracks it rated badly too, or
    precision is computed over a set the model chose for itself.
    """
    random.seed(7)
    rows, per_mood = [], max(1, n // len(MOODS))

    for mood_id, mood in MOODS.items():
        ranked = sorted(tracks, key=lambda t: score_full(t, mood), reverse=True)
        top = ranked[: per_mood // 2]
        middle = random.sample(ranked[len(ranked) // 4: len(ranked) * 3 // 4],
                               min(per_mood // 4, max(1, len(ranked) // 4)))
        bottom = random.sample(ranked[-len(ranked) // 4:],
                               min(per_mood - len(top) - len(middle), max(1, len(ranked) // 4)))
        for t in top + middle + bottom:
            rows.append({
                "mood": mood_id,
                "track_id": t["id"],
                "title": t["title"],
                "artist": t["artist"],
                "bpm": t["bpm"],
                "dials": {"e": t["e"], "w": t["w"], "t": t["t"], "v": t["v"]},
                "fits": None,          # <-- fill in true / false
            })

    random.shuffle(rows)               # blind: don't label in score order
    out.write_text(json.dumps(rows, indent=2))
    print(f"  wrote {len(rows)} rows to {out}")
    print("  Set \"fits\": true or false on each, then re-run without --make-labels.")
    print("  Judge one question only: would you want this in that session?")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--make-labels", type=int, metavar="N")
    ap.add_argument("-k", type=int, default=6)
    ap.add_argument("--tracks", type=Path, default=TRACKS)
    ap.add_argument("--labels", type=Path, default=LABELS)
    args = ap.parse_args()

    if not args.tracks.exists():
        raise SystemExit(f"No dataset at {args.tracks}. Run the ingest pipeline first.")
    tracks = json.loads(args.tracks.read_text())

    if args.make_labels:
        make_labels(tracks, args.make_labels, args.labels)
        raise SystemExit(0)

    if not args.labels.exists():
        raise SystemExit(
            f"No labels at {args.labels}.\n"
            f"  Create a worksheet: python eval/evaluate.py --make-labels 200"
        )

    raw = [r for r in json.loads(args.labels.read_text()) if r.get("fits") is not None]
    if not raw:
        raise SystemExit("Labels file has no completed rows — every 'fits' is still null.")

    print(f"  {len(tracks)} tracks, {len(raw)} labelled pairs")
    report(evaluate(tracks, raw, args.k), args.k)
