"""
Shrink the audio bundle so the site can actually deploy.

Full-length Jamendo MP3s come to well over a gigabyte for a few hundred tracks.
GitHub refuses single files above 100 MB and struggles past ~1 GB per repo, and
a visitor should not download 4 MB to hear whether a recommendation was any
good.

So the deployed build ships PREVIEWS: a slice from the middle of each track,
re-encoded smaller. The middle matters — intros are often silence or a slow
build, and a preview that opens on two seconds of nothing reads as broken.

This does not touch the analysis. Feature extraction already ran on the full
files, so the dials and BPM stay exactly as measured. Only what the browser
downloads changes.

    python3 scripts/make_previews.py                    # 45s, 96kbps mono
    python3 scripts/make_previews.py --seconds 30       # smaller
    python3 scripts/make_previews.py --bitrate 64k      # smaller still

Writes to public/audio_preview/, leaving the originals alone. Point tracks.json
at the new folder with --rewrite-json when you are happy with the result.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "audio"
DST = ROOT / "public" / "audio_preview"
TRACKS = ROOT / "public" / "tracks.json"


def duration_of(path: Path) -> float:
    """Length in seconds, via ffprobe. 0.0 if it can't be read."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, check=True,
        )
        return float(out.stdout.strip())
    except Exception:
        return 0.0


def make_preview(src: Path, dst: Path, seconds: int, bitrate: str) -> bool:
    total = duration_of(src)
    # start a third of the way in, so we skip intros without landing on the outro
    start = max(0.0, min(total / 3.0, max(0.0, total - seconds)))

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-ss", f"{start:.2f}", "-t", str(seconds), "-i", str(src),
        "-ac", "1",                 # mono: halves the size, fine for a preview
        "-b:a", bitrate,
        "-af", "afade=t=in:st=0:d=0.4,"
               f"afade=t=out:st={max(0, seconds - 1)}:d=1.0",   # no hard cuts
        str(dst),
    ]
    try:
        subprocess.run(cmd, check=True)
        return True
    except subprocess.CalledProcessError:
        return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=int, default=45)
    ap.add_argument("--bitrate", default="96k")
    ap.add_argument("--rewrite-json", action="store_true",
                    help="point tracks.json at the previews")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg not found:  sudo apt install -y ffmpeg")
    if not SRC.exists():
        raise SystemExit(f"No audio at {SRC}")

    files = sorted(SRC.glob("*.mp3"))
    if not files:
        raise SystemExit(f"No mp3s in {SRC}")

    DST.mkdir(parents=True, exist_ok=True)
    before = sum(f.stat().st_size for f in files)

    ok = 0
    for i, src in enumerate(files, 1):
        dst = DST / src.name
        if dst.exists() and dst.stat().st_size > 5_000:
            ok += 1
            continue
        if make_preview(src, dst, args.seconds, args.bitrate):
            ok += 1
        if i % 50 == 0:
            print(f"  {i}/{len(files)}")

    after = sum(f.stat().st_size for f in DST.glob("*.mp3"))
    mb = lambda b: b / 1_048_576
    print(f"\n  {ok}/{len(files)} previews written")
    print(f"  {mb(before):.0f} MB  ->  {mb(after):.0f} MB "
          f"({(1 - after / max(before, 1)) * 100:.0f}% smaller)")

    if after > 800 * 1_048_576:
        print("  still over 800 MB — try --seconds 30 --bitrate 64k")

    if args.rewrite_json:
        rows = json.loads(TRACKS.read_text())
        for r in rows:
            r["audio"] = r["audio"].replace("/audio/", "/audio_preview/")
        TRACKS.write_text(json.dumps(rows, separators=(",", ":")))
        print(f"\n  tracks.json now points at /audio_preview/")
        print("  keep public/audio/ out of git — see .gitignore")


if __name__ == "__main__":
    main()
