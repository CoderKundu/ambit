"""
Interactive labeller. Beats hand-editing JSON: one track at a time, single
keypress, saves as you go.

    python3 eval/label.py

Keys:  y = fits    n = doesn't fit    s = skip    q = save and quit

Progress is written after every answer, so you can quit whenever and pick up
where you left off. Already-labelled rows are skipped automatically.

If the dev server is running (npm run dev), each row prints a URL you can open
to hear the track before judging it.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

LABELS = Path(__file__).resolve().parent / "labels.json"
SERVER = "http://localhost:3000"

MOOD_DESC = {
    "deep-focus": "Two hours of work. No lyrics, nothing that grabs attention.",
    "late-night-drive": "Empty road at 1am. Low end, steady, atmospheric.",
    "sunday-morning": "Slow, warm, forgiving. Coffee not finished.",
    "gym-push": "Last four reps. Loud, blunt, relentless.",
    "rainy-commute": "Headphones against a wet window for 40 minutes.",
    "dinner-party": "Present but not competing with conversation.",
    "long-haul-flight": "Nine hours, cabin drone, drifting in and out.",
    "reset-after-work": "Decompressing. Nothing that demands a decision.",
}


def getkey() -> str:
    """Read one keypress without needing Enter."""
    try:
        import termios, tty
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            return sys.stdin.read(1).lower()
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
    except Exception:
        # not a real terminal (piped input, some IDEs) — fall back to Enter-based
        line = sys.stdin.readline()
        if not line:
            return "q"
        return (line.strip().lower() or " ")[0]


def main() -> None:
    if not LABELS.exists():
        raise SystemExit(
            "No labels.json. Create one first:\n"
            "  python3 eval/evaluate.py --make-labels 200"
        )

    rows = json.loads(LABELS.read_text())
    todo = [i for i, r in enumerate(rows) if r.get("fits") is None]
    done = len(rows) - len(todo)

    if not todo:
        print(f"All {len(rows)} rows already labelled. Run:\n  python3 eval/evaluate.py")
        return

    print("\n" + "=" * 62)
    print("  LABELLING — one question per track:")
    print("  Would you want this track in that session?")
    print()
    print("  y = yes    n = no    s = skip    q = save and quit")
    print("=" * 62)

    for n, i in enumerate(todo, 1):
        r = rows[i]
        d = r.get("dials", {})
        bpm = r.get("bpm")

        print(f"\n  [{done + n}/{len(rows)}]  {r['mood'].replace('-', ' ').upper()}")
        print(f"  {MOOD_DESC.get(r['mood'], '')}")
        print(f"\n    {r.get('title', '?')}")
        print(f"    {r.get('artist', '?')}")
        print(f"    {bpm} BPM" if bpm else "    no steady beat")
        print(f"    energy {d.get('e','?'):>3}   warmth {d.get('w','?'):>3}"
              f"   pace {d.get('t','?'):>3}   vocals {d.get('v','?'):>3}")
        print(f"    listen: {SERVER}/audio/{r['track_id']}.mp3")
        print("\n    fits? ", end="", flush=True)

        while True:
            k = getkey()
            if k in ("y", "n", "s", "q"):
                break

        if k == "q":
            print("q\n\n  saved. re-run this script to continue.")
            break
        if k == "s":
            print("skipped")
            continue

        rows[i]["fits"] = (k == "y")
        print("YES" if k == "y" else "no")
        LABELS.write_text(json.dumps(rows, indent=2))   # save every answer

    labelled = sum(1 for r in rows if r.get("fits") is not None)
    pos = sum(1 for r in rows if r.get("fits") is True)
    print(f"\n  {labelled}/{len(rows)} labelled  ({pos} fit, {labelled - pos} don't)")

    per_mood: dict[str, int] = {}
    for r in rows:
        if r.get("fits") is not None:
            per_mood[r["mood"]] = per_mood.get(r["mood"], 0) + 1
    thin = [m for m, c in per_mood.items() if c < 6]
    if thin:
        print(f"  thin coverage on: {', '.join(thin)} — precision@6 needs 6+ each")

    if labelled >= 40:
        print("\n  ready:  python3 eval/evaluate.py")


if __name__ == "__main__":
    main()
