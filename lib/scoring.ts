import { DIAL_FIELD, DIAL_KEYS, type Dials, type Mood, type Track } from "./moods";

export type Scored = Track & {
  match: number;
  gaps: Record<keyof Dials, number>;   // signed: track − session
};

/**
 * Per-dial weights. Energy and pace define a situation more strongly than
 * warmth, and vocals is weighted lowest on purpose: it comes from a proxy that
 * confuses solo instruments with singing (see ingest/analyze.py). Weighting a
 * signal by how much you trust it is cheaper than pretending it's reliable.
 */
export const WEIGHTS: Record<keyof Dials, number> = {
  energy: 1.15, warmth: 0.8, pace: 1.1, vocals: 0.75,
};

const WEIGHT_SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

/** Gap beyond which a single dial starts taking a real penalty. */
const PENALTY_THRESHOLD = 30;
const PENALTY_RATE = 0.6;

/** A critical dial missed by more than this disqualifies the track outright. */
const VETO_THRESHOLD = 45;

export function scoreTrack(track: Track, dials: Dials, mood?: Mood): Scored {
  const gaps = {} as Record<keyof Dials, number>;
  let weighted = 0;
  let worst = 0;

  for (const key of DIAL_KEYS) {
    const delta = track[DIAL_FIELD[key]] - dials[key];
    gaps[key] = delta;
    const abs = Math.abs(delta);
    weighted += abs * WEIGHTS[key];
    if (abs > worst) worst = abs;
  }

  const mean = weighted / WEIGHT_SUM;

  /**
   * Mean distance alone is too forgiving: perfect on three dials and
   * catastrophic on one scores the same as mediocre everywhere. The penalty
   * makes a single bad miss hurt.
   */
  const penalty = worst > PENALTY_THRESHOLD ? (worst - PENALTY_THRESHOLD) * PENALTY_RATE : 0;

  let match = Math.max(0, Math.round(100 - mean - penalty));

  /**
   * The veto. Averaging cannot express "this is simply wrong for the moment" —
   * a lyric-heavy track during deep focus fails at the thing the session is
   * for, no matter how well it matches on tempo.
   */
  if (mood?.critical) {
    const criticalGap = Math.abs(gaps[mood.critical]);
    if (criticalGap > VETO_THRESHOLD) match = Math.min(match, 35);
  }

  return { ...track, match, gaps };
}

export function scoreAll(tracks: Track[], dials: Dials, mood?: Mood): Scored[] {
  return tracks
    .map((t) => scoreTrack(t, dials, mood))
    .sort((a, b) => b.match - a.match);
}

/**
 * Pick the queue.
 *
 * Taking the top N by score gives you six near-identical tracks — they are all
 * near-identical *because* they are all near the same point. A session needs
 * spread, so each pick after the first must differ from everything already
 * chosen by `minDistance` across the dial space.
 *
 * The threshold relaxes if the library is too thin to satisfy it, so a small or
 * lopsided library degrades to plain top-N rather than returning fewer tracks
 * than asked for.
 */
export function selectQueue(
  scored: Scored[],
  count = 6,
  minDistance = 18,
): Scored[] {
  if (scored.length <= count) return scored;

  const chosen: Scored[] = [];
  let threshold = minDistance;

  while (chosen.length < count && threshold >= 0) {
    for (const cand of scored) {
      if (chosen.length >= count) break;
      if (chosen.some((c) => c.id === cand.id)) continue;

      const tooClose = chosen.some((c) => dialDistance(c, cand) < threshold);
      if (!tooClose) chosen.push(cand);
    }
    threshold -= 6;   // relax and sweep again if we came up short
  }

  return chosen.slice(0, count);
}

function dialDistance(a: Track, b: Track): number {
  const de = a.e - b.e, dw = a.w - b.w, dt = a.t - b.t, dv = a.v - b.v;
  return Math.sqrt(de * de + dw * dw + dt * dt + dv * dv);
}

/**
 * Order the queue as a session rather than a ranking.
 *
 * Sorting by score descending means the session gets monotonically worse as it
 * plays, which is the opposite of how a set is built. Instead: open with the
 * strongest match, then run in ascending energy so the session lifts.
 */
export function sequence(queue: Scored[]): Scored[] {
  if (queue.length < 3) return queue;
  const [opener, ...rest] = queue;
  rest.sort((a, b) => a.e - b.e);
  return [opener, ...rest];
}

/**
 * Move the dials away from a rejected track.
 *
 * "Not now" should teach the system something, not just hide a row. The dials
 * step away from the rejected track's profile, weighted by how far off each
 * dial already was — the dial that was most wrong moves most.
 */
export function reweight(dials: Dials, rejected: Track, strength = 0.22): Dials {
  const next = { ...dials };
  let maxGap = 1;
  const gaps = {} as Record<keyof Dials, number>;

  for (const key of DIAL_KEYS) {
    gaps[key] = rejected[DIAL_FIELD[key]] - dials[key];
    maxGap = Math.max(maxGap, Math.abs(gaps[key]));
  }

  for (const key of DIAL_KEYS) {
    const share = Math.abs(gaps[key]) / maxGap;       // 0..1
    const step = -Math.sign(gaps[key]) * share * strength * 20;
    next[key] = Math.round(Math.min(100, Math.max(0, next[key] + step)));
  }
  return next;
}
