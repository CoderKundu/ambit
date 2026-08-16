# Ambit app — setup

Run these from inside this folder, in your Ubuntu/WSL terminal.

## 1. Node

Check whether you have it:

    node --version

If that errors, install it:

    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs

## 2. Bring in the dataset from the ingest pipeline

    mkdir -p public/audio
    cp ~/ambit/public/tracks.json public/
    cp ~/ambit/data/audio/*.mp3 public/audio/

Check it worked — the first number should match your track count:

    ls public/audio | wc -l

## 3. Install and run

    npm install
    npm run dev

Open http://localhost:3000

## 4. Build the static site (later, for deploying)

    npm run build

Output lands in `out/` — plain files, no server needed.

## Notes

- `npm install` takes a few minutes the first time.
- If port 3000 is busy: `npm run dev -- -p 3001`
- Audio not playing? Check the browser console. The paths in tracks.json
  are `/audio/<id>.mp3` and must match the filenames in public/audio.
