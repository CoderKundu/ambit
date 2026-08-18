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

    DEGENERATE CASE, and it bit this project: if a mood has fewer than k
    labelled tracks, every model is handed the same set — just in a different
    order — and precision cannot see order. All models then score identically,
    including random. That is not a tie, it is the metric failing silently, so
    we return None rather than a meaningless number.
    """
    judged = [t for t in ranked if t["id"] in labels]
    if len(judged) < k + 2:
        return None            # too few to discriminate between rankings
    top = judged[:k]
    return sum(1 for t in top if labels[t["id"]]) / len(top)


def auc(ranked: list[dict], labels: dict[str, bool]) -> float | None:
    """
    Probability that a random track you liked ranks above one you didn't.

    0.5 is coin-flip; 1.0 is perfect. Unlike precision@k this uses the FULL
    ordering, so it stays meaningful with a handful of labels per mood — which
    is exactly the situation hand-labelling produces. It is the honest primary
    metric for a dataset this size.
    """
    judged = [t for t in ranked if t["id"] in labels]
    pos = [i for i, t in enumerate(judged) if labels[t["id"]]]
    neg = [i for i, t in enumerate(judged) if not labels[t["id"]]]
    if not pos or not neg:
        return None            # needs both classes present
    wins = sum(1 for p in pos for n in neg if p < n)
    ties = sum(1 for p in pos for n in neg if p == n)
    return (wins + 0.5 * ties) / (len(pos) * len(neg))


def evaluate(tracks: list[dict], labels_raw: list[dict], k: int = 6) -> dict:
    by_mood: dict[str, dict[str, bool]] = {}
    for row in labels_raw:
        by_mood.setdefault(row["mood"], {})[row["track_id"]] = bool(row["fits"])

    results: dict[str, dict] = {}
    for name, fn in MODELS.items():
        per_mood, coverage, aucs = [], [], []
        for mood_id, labels in by_mood.items():
            mood = MOODS.get(mood_id)
            if not mood:
                continue
            ranked = sorted(tracks, key=lambda t: fn(t, mood), reverse=True)
            a = auc(ranked, labels)
            if a is not None:
                aucs.append(a)
            p = precision_at_k(ranked, labels, k)
            if p is not None:
                per_mood.append((mood_id, p))
                # how many of the top-k were actually judged — a P@6 backed by
                # 3 labelled tracks is not the same evidence as one backed by 6
                coverage.append(min(k, len([t for t in ranked if t["id"] in labels])))
        mean = sum(p for _, p in per_mood) / len(per_mood) if per_mood else 0.0
        results[name] = {
            "mean_auc": (sum(aucs) / len(aucs)) if aucs else None,
            "moods_with_auc": len(aucs),
            "mean_precision": mean,
            "per_mood": dict(per_mood),
            "moods_evaluated": len(per_mood),
            "labels_used": sum(len(v) for v in [labels]) if False else sum(coverage),
            "judged_per_mood": (sum(coverage) / len(coverage)) if coverage else 0,
        }
    return results


def report(results: dict, k: int) -> None:
    have_p = any(r["moods_evaluated"] for r in results.values())

    print("\n  AUC — chance a track you liked outranks one you didn't")
    print("  (0.50 = coin flip, 1.00 = perfect)\n")
    print(f"  {'model':<20} {'AUC':>7}")
    print("  " + "-" * 30)
    ordered = sorted(results.items(),
                     key=lambda kv: -(kv[1]["mean_auc"] or 0))
    for name, r in ordered:
        a = r["mean_auc"]
        print(f"  {name:<20} {a:>7.3f}" if a is not None else f"  {name:<20} {'n/a':>7}")

    if have_p:
        print(f"\n  precision@{k}\n")
        print(f"  {'model':<20} {'P@' + str(k):>7}")
        print("  " + "-" * 30)
        for name, r in sorted(results.items(), key=lambda kv: -kv[1]["mean_precision"]):
            print(f"  {name:<20} {r['mean_precision']:>7.3f}")
    else:
        print(f"\n  precision@{k}: skipped — no mood has {k + 2}+ labelled tracks.")
        print(f"  It cannot separate models below that; AUC above is the usable metric.")

    full = results.get("full model", {}).get("mean_auc") or 0
    tempo = results.get("tempo only", {}).get("mean_auc") or 0
    veto = results.get("no veto", {}).get("mean_auc") or 0
    plain = results.get("unweighted mean", {}).get("mean_auc") or 0
    rand = results.get("random", {}).get("mean_auc") or 0.5

    print("\n  what this says:")
    if full <= rand + 0.02:
        print("  * The model is not distinguishing fits from misfits at all.")
        print("    Something is wrong upstream — check the dials, not the weights.")
    elif full <= tempo:
        print(f"  * Tempo alone does as well ({tempo:.3f} vs {full:.3f}). The other")
        print("    three dials are not earning their place yet.")
    else:
        print(f"  * Four dials beat tempo alone: {full:.3f} vs {tempo:.3f} ({full - tempo:+.3f}).")
    if full > plain:
        print(f"  * Weighting + penalty add {full - plain:+.3f} over a plain mean.")
    if full <= veto:
        print("  * The veto is not helping on this sample.")

    n = results.get("full model", {}).get("labels_used", 0)
    moods = results.get("full model", {}).get("moods_with_auc", 0)
    print(f"\n  evidence: {moods} moods with both fits and misfits labelled")
    if moods < 4:
        print("  * Fewer than 4 usable moods. Label more, especially misfits.")
    if n and n < 80:
        print("  * Small sample — treat as directional.")


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
