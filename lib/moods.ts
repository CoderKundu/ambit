export type Dials = { energy: number; warmth: number; pace: number; vocals: number };

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  bpm: number | null;   // null when the track has no reliable beat
  dur: number;
  e: number;            // energy   0-100
  w: number;            // warmth   0-100
  t: number;            // pace     0-100
  v: number;            // vocals   0-100
  audio: string;
  license: string;
  source: string;
};

export type Mood = {
  id: string;
  name: string;
  desc: string;
  dials: Dials;
  /** Typical tempo band for this situation. Used in explanations, not scoring. */
  lo: number;
  hi: number;
  /** Colour temperature of the interface for this moment. */
  hue: number;
  /** How hard the interface pushes its colour. 0 = near-grey, 1 = loud. */
  force: number;
  /** Night moods invert the whole theme. */
  dark?: boolean;
  /**
   * Dial that defines this situation. A track that badly misses it is wrong for
   * the moment however well it scores elsewhere — no lyrics during deep focus,
   * no ballads mid-workout.
   */
  critical?: keyof Dials;
};

export const MOODS: Mood[] = [
  {
    id: "deep-focus",
    name: "Deep Focus",
    desc: "Two hours, no lyrics, nothing that asks for attention.",
    dials: { energy: 34, warmth: 52, pace: 40, vocals: 12 },
    lo: 60, hi: 92, hue: 205, force: 0.2, critical: "vocals",
  },
  {
    id: "late-night-drive",
    name: "Late Night Drive",
    desc: "Empty road, low end, streetlights doing the work.",
    dials: { energy: 62, warmth: 38, pace: 62, vocals: 34 },
    lo: 88, hi: 110, hue: 255, force: 0.9, dark: true,
  },
  {
    id: "sunday-morning",
    name: "Sunday Morning",
    desc: "Slow, warm, forgiving. Coffee not yet finished.",
    dials: { energy: 30, warmth: 84, pace: 36, vocals: 62 },
    lo: 62, hi: 88, hue: 15, force: 0.16, critical: "warmth",
  },
  {
    id: "gym-push",
    name: "Gym / Push",
    desc: "Last four reps. Loud, blunt, relentless.",
    dials: { energy: 94, warmth: 30, pace: 88, vocals: 58 },
    lo: 124, hi: 150, hue: 32, force: 1.0, critical: "energy",
  },
  {
    id: "rainy-commute",
    name: "Rainy Commute",
    desc: "Headphones against a wet window for 40 minutes.",
    dials: { energy: 44, warmth: 60, pace: 46, vocals: 48 },
    lo: 70, hi: 100, hue: 225, force: 0.3,
  },
  {
    id: "dinner-party",
    name: "Dinner Party",
    desc: "Present but not competing with the conversation.",
    dials: { energy: 52, warmth: 76, pace: 54, vocals: 54 },
    lo: 92, hi: 116, hue: 305, force: 0.55,
  },
  {
    id: "long-haul-flight",
    name: "Long Haul Flight",
    desc: "Nine hours, cabin drone, drifting in and out.",
    dials: { energy: 26, warmth: 46, pace: 30, vocals: 20 },
    lo: 55, hi: 80, hue: 285, force: 0.7, dark: true, critical: "energy",
  },
  {
    id: "reset-after-work",
    name: "Reset After Work",
    desc: "Decompressing. Nothing that demands a decision.",
    dials: { energy: 38, warmth: 68, pace: 42, vocals: 44 },
    lo: 68, hi: 96, hue: 155, force: 0.32,
  },
];

export const moodById = (id: string) => MOODS.find((m) => m.id === id);

/** Field on Track holding each dial's value. */
export const DIAL_FIELD: Record<keyof Dials, "e" | "w" | "t" | "v"> = {
  energy: "e", warmth: "w", pace: "t", vocals: "v",
};

export const DIAL_LABEL: Record<keyof Dials, string> = {
  energy: "Energy", warmth: "Warmth", pace: "Pace", vocals: "Vocals",
};

export const DIAL_KEYS = ["energy", "warmth", "pace", "vocals"] as const;
