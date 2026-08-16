import { DIAL_KEYS, type Dials, type Mood } from "./moods";
import type { Scored } from "./scoring";

/**
 * Build the sentence that explains a pick.
 *
 * Every clause comes from `scored.gaps` — the same deltas that produced the
 * ranking. Nothing here is hand-written per track, and nothing is stored. Move a
 * slider and the sentence rewrites, because the number behind it changed.
 *
 * The point is structural: the UI cannot claim something the model didn't do.
 * To break the explanation you would have to break the ranking.
 */

const NOUN: Record<keyof Dials, string> = {
  energy: "energy", warmth: "warmth", pace: "pace", vocals: "vocals",
};

const ABOVE: Record<keyof Dials, string> = {
  energy: "more driving", warmth: "warmer", pace: "faster", vocals: "more vocal-led",
};

const BELOW: Record<keyof Dials, string> = {
  energy: "calmer", warmth: "cooler", pace: "slower", vocals: "more instrumental",
};

const CLOSE_ENOUGH = 12;
const WORTH_MENTIONING = 20;

export function explain(track: Scored, mood: Mood, seed = 0): string {
  const ranked = DIAL_KEYS
    .map((key) => ({
      key,
      abs: Math.abs(track.gaps[key]),
      word: track.gaps[key] > 0 ? ABOVE[key] : BELOW[key],
    }))
    .sort((a, b) => a.abs - b.abs);

  const close = ranked.filter((g) => g.abs <= CLOSE_ENOUGH).slice(0, 3);
  const worst = ranked[ranked.length - 1];
  const parts: string[] = [];

  // 1 — what it gets right, named specifically so no two rows read alike
  if (close.length) {
    const names = close.map((g) => NOUN[g.key]);
    const list = names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
      : names[0];
    const tail = names.length > 2 ? " all land where you set them."
      : names.length > 1 ? " land where you set them."
      : " lands where you set it.";
    parts.push(seed % 2
      ? `Close on ${list}.`
      : list.charAt(0).toUpperCase() + list.slice(1) + tail);
  } else {
    parts.push("Nothing in the library sits exactly here — this is the closest it gets.");
  }

  // 2 — tempo, only when it adds something
  if (track.bpm === null) {
    if (ranked[0].key === "pace") {
      parts.push("No steady pulse to speak of, which is why it sits at this pace.");
    }
  } else {
    const inBand = track.bpm >= mood.lo && track.bpm <= mood.hi;
    if (inBand && ranked[0].key === "pace") {
      parts.push(`At ${track.bpm} BPM it's dead centre of the ${mood.lo}–${mood.hi} this session runs on.`);
    } else if (!inBand) {
      const side = track.bpm < mood.lo ? "under" : "over";
      parts.push(`${track.bpm} BPM puts it ${side} the ${mood.lo}–${mood.hi} you'd normally get here.`);
    }
  }

  // 3 — the honest caveat
  if (worst.abs > WORTH_MENTIONING) {
    const lead = parts.length > 1 ? "The stretch is" : "The one stretch is";
    parts.push(`${lead} ${NOUN[worst.key]} — ${worst.word} than you asked for.`);
  }

  return parts.join(" ");
}

/** Plain-English summary of where the dials sit, for people who never open them. */
const SCALE: Record<keyof Dials, [number, string][]> = {
  energy: [[30, "very calm"], [50, "easygoing"], [72, "lively"], [101, "high energy"]],
  warmth: [[30, "cool tone"], [50, "neutral tone"], [72, "warm tone"], [101, "very warm tone"]],
  pace:   [[30, "slow pace"], [50, "unhurried pace"], [72, "steady pace"], [101, "fast pace"]],
  vocals: [[25, "instrumental"], [50, "few vocals"], [72, "some vocals"], [101, "vocal-led"]],
};

export function describeDial(key: keyof Dials, value: number): string {
  for (const [ceiling, label] of SCALE[key]) if (value < ceiling) return label;
  return SCALE[key][SCALE[key].length - 1][1];
}

export function summarise(dials: Dials): string[] {
  return DIAL_KEYS.map((k) => describeDial(k, dials[k]));
}
