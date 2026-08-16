import { DIAL_FIELD, type Mood, type Track } from "./moods";

/**
 * Derive each mood's tempo band from the library that actually shipped.
 *
 * The bands started as hand-written constants ("Late Night Drive: 88-110"),
 * carried over from the mockup. That breaks the moment the dials become
 * percentiles: pace 62 means "faster than 62% of this library", which maps to
 * whatever BPM this particular library happens to have there. Testing against a
 * synthetic corpus, almost every pick reported "over the 88-110" — the
 * explanation was measuring the track against a number with no relationship to
 * the data.
 *
 * So the band is computed: take the tracks nearest this mood's pace setting,
 * and report the interquartile range of their real tempos. The sentence "at 104
 * BPM it's dead centre of the 88-110 this session runs on" then describes
 * something true about the library rather than a guess left over from a mockup.
 *
 * Run once at load, cached for the session.
 */

const NEIGHBOURHOOD = 0.18;   // fraction of the library counted as "near" the dial

export function deriveBand(tracks: Track[], mood: Mood): { lo: number; hi: number } {
  const withBeat = tracks.filter((t) => t.bpm !== null);
  if (withBeat.length < 12) return { lo: mood.lo, hi: mood.hi };   // too thin, keep the default

  const target = mood.dials.pace;
  const near = withBeat
    .map((t) => ({ bpm: t.bpm as number, dist: Math.abs(t[DIAL_FIELD.pace] - target) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, Math.max(12, Math.round(withBeat.length * NEIGHBOURHOOD)))
    .map((x) => x.bpm)
    .sort((a, b) => a - b);

  const q = (p: number) => near[Math.min(near.length - 1, Math.floor(near.length * p))];
  return { lo: Math.round(q(0.25)), hi: Math.round(q(0.75)) };
}

export function withDerivedBands(tracks: Track[], moods: Mood[]): Mood[] {
  return moods.map((m) => ({ ...m, ...deriveBand(tracks, m) }));
}
