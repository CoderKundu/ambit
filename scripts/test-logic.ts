import { MOODS, moodById, type Track } from "../lib/moods";
import { scoreAll, selectQueue, sequence, reweight, scoreTrack } from "../lib/scoring";
import { explain, summarise } from "../lib/explain";

// deterministic pseudo-random library
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function makeLibrary(n: number): Track[] {
  const out: Track[] = [];
  for (let i = 0; i < n; i++) {
    const e = Math.round(rnd() * 100), w = Math.round(rnd() * 100);
    const t = Math.round(rnd() * 100), v = Math.round(rnd() * 100);
    const beatless = rnd() < 0.12;
    out.push({
      id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i % 40}`,
      album: "X", year: "2023", genre: "Test",
      bpm: beatless ? null : Math.round(55 + (t / 100) * 105),
      dur: 200, e, w, t, v,
      audio: `/audio/t${i}.mp3`, license: "cc-by", source: "",
    });
  }
  return out;
}

const lib = makeLibrary(800);
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

console.log("\n=== 1. veto: lyric-heavy track in Deep Focus ===");
const focus = moodById("deep-focus")!;
const lyricy: Track = { ...lib[0], id: "lyric", e: 34, w: 52, t: 40, v: 95 };
const perfectish: Track = { ...lib[0], id: "ok", e: 44, w: 62, t: 50, v: 20 };
const a = scoreTrack(lyricy, focus.dials, focus);
const b = scoreTrack(perfectish, focus.dials, focus);
console.log(`  lyric-heavy (vocals 95 vs 12): ${a.match}`);
console.log(`  decent all-round:              ${b.match}`);
check("veto caps a critical-dial miss", a.match <= 35);
check("veto does not punish a normal track", b.match > 60);

console.log("\n=== 2. diversity: does the queue spread out? ===");
const drive = moodById("late-night-drive")!;
const scored = scoreAll(lib, drive.dials, drive);
const naive = scored.slice(0, 6);
const diverse = selectQueue(scored, 6);
const spread = (q: typeof scored) => {
  let total = 0, pairs = 0;
  for (let i = 0; i < q.length; i++)
    for (let j = i + 1; j < q.length; j++) {
      const d = Math.hypot(q[i].e - q[j].e, q[i].w - q[j].w, q[i].t - q[j].t, q[i].v - q[j].v);
      total += d; pairs++;
    }
  return total / pairs;
};
const ns = spread(naive), ds = spread(diverse);
console.log(`  mean pairwise distance — top-6: ${ns.toFixed(1)}, diverse: ${ds.toFixed(1)}`);
console.log(`  mean match             — top-6: ${(naive.reduce((s, t) => s + t.match, 0) / 6).toFixed(1)}, diverse: ${(diverse.reduce((s, t) => s + t.match, 0) / 6).toFixed(1)}`);
check("diverse queue is more spread out", ds > ns);
check("diverse queue still returns 6", diverse.length === 6);

console.log("\n=== 3. sequencing ===");
const seq = sequence(diverse);
const rising = seq.slice(1).every((t, i, arr) => i === 0 || arr[i - 1].e <= t.e);
check("opens with the best match", seq[0].id === diverse[0].id);
check("body rises in energy", rising);

console.log("\n=== 4. reweighting on 'Not now' ===");
let dials = { ...drive.dials };
const before = scoreAll(lib, dials, drive);
const reject = before[0];
dials = reweight(dials, reject);
const after = scoreAll(lib, dials, drive);
console.log(`  rejected: e${reject.e} w${reject.w} t${reject.t} v${reject.v}`);
console.log(`  dials before: ${JSON.stringify(drive.dials)}`);
console.log(`  dials after:  ${JSON.stringify(dials)}`);
const moved = Object.keys(dials).some(
  (k) => dials[k as keyof typeof dials] !== drive.dials[k as keyof typeof dials]);
check("dials actually move", moved);
check("rejected track ranks lower after", after.findIndex(t => t.id === reject.id) > 0);

console.log("\n=== 5. explanations vary with the dials ===");
const q = selectQueue(scoreAll(lib, drive.dials, drive), 4);
q.forEach((t, i) => console.log(`  ${t.match}%  ${explain(t, drive, i)}`));
const sentences = q.map((t, i) => explain(t, drive, i));
check("no two explanations identical", new Set(sentences).size === sentences.length);

const shifted = { ...drive.dials, vocals: 90 };
const q2 = selectQueue(scoreAll(lib, shifted, drive), 4);
console.log(`\n  after dragging vocals to 90:`);
q2.forEach((t, i) => console.log(`  ${t.match}%  ${explain(t, drive, i)}`));
check("queue changes when a dial moves", q2[0].id !== q[0].id);

console.log("\n=== 6. beatless tracks ===");
const noBeat = lib.filter((t) => t.bpm === null);
const nbScored = scoreTrack(noBeat[0], drive.dials, drive);
const nbText = explain(nbScored, drive, 0);
console.log(`  ${nbText}`);
check("no fabricated BPM in text", !/\d+ BPM/.test(nbText) || nbScored.bpm !== null);

console.log("\n=== 7. summary line ===");
console.log(`  ${summarise(drive.dials).join(" · ")}`);
check("summary has four parts", summarise(drive.dials).length === 4);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}\n`);


// --- 8. derived tempo bands -------------------------------------------------
import { deriveBand } from "../lib/bands";
console.log("=== 8. tempo bands derived from the library ===");
for (const m of [focus, drive, moodById("gym-push")!]) {
  const d = deriveBand(lib, m);
  console.log(`  ${m.name.padEnd(18)} hardcoded ${m.lo}-${m.hi}   derived ${d.lo}-${d.hi}`);
}
const dv = deriveBand(lib, drive);
const q3 = selectQueue(scoreAll(lib, drive.dials, drive), 3);
console.log("  explanations with the derived band:");
q3.forEach((t, i) => console.log(`    ${explain(t, { ...drive, ...dv }, i)}`));
const inBand = q3.filter(t => t.bpm !== null && t.bpm >= dv.lo && t.bpm <= dv.hi).length;
console.log(`  ${inBand}/${q3.length} picks now fall inside their own session's band`);
process.exit(failures === 0 ? 0 : 1);
