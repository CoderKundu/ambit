import type { Mood, Track } from "./moods";

/**
 * Every colour in a session derives from one hue plus one intensity, so nothing
 * can drift out of step. `force` is how hard the moment pushes: Deep Focus sits
 * near-grey at 0.2, Gym / Push runs flat out at 1.0.
 *
 * Night moods invert the whole theme rather than tinting a light one — no
 * light-background palette reads as "empty road at 1am"; violet on cream just
 * looks lavender.
 */
/**
 * Named colour roles. Every screen reads these rather than hard-coded values —
 * that is what lets a night mood invert the whole interface without a single
 * component knowing whether it is light or dark.
 */
export type Theme = {
  hue: number;
  isDark: boolean;
  text: string; text2: string; textSoft: string; textMute: string;
  accent: string; accentText: string; solid: string; onSolid: string;
  bg: string; bgFade: string; wash: string; onWash: string; onWashSoft: string;
  line: string; line2: string; rule: string;
  chip: string; chipStrong: string; hover: string; track: string; shadow: string;
};

const n = (x: number) => x.toFixed(3);

export function paletteFor(hue: number, force = 0.35, dark = false): Theme {
  const f = force;

  if (dark) {
    return {
      hue, isDark: true,
      text: `oklch(0.955 0.008 ${hue})`,
      text2: `oklch(0.865 0.014 ${hue})`,
      textSoft: `oklch(0.740 0.020 ${hue})`,
      textMute: `oklch(0.630 0.022 ${hue})`,
      accent: `oklch(0.760 ${n(0.09 + f * 0.07)} ${hue})`,
      accentText: `oklch(0.800 ${n(0.08 + f * 0.07)} ${hue})`,
      solid: `oklch(0.880 ${n(0.06 + f * 0.06)} ${hue})`,
      onSolid: `oklch(0.200 0.040 ${hue})`,
      bg: `oklch(${n(0.215 - f * 0.03)} ${n(0.02 + f * 0.02)} ${hue})`,
      bgFade: `oklch(${n(0.215 - f * 0.03)} ${n(0.02 + f * 0.02)} ${hue} / 0.86)`,
      wash: `linear-gradient(180deg, oklch(${n(0.34 - f * 0.04)} ${n(0.045 + f * 0.045)} ${hue}) 0%, oklch(${n(0.215 - f * 0.03)} ${n(0.02 + f * 0.02)} ${hue}) 100%)`,
      onWash: `oklch(0.965 0.012 ${hue})`,
      onWashSoft: `oklch(0.780 0.030 ${hue})`,
      line: `oklch(${n(0.31 - f * 0.03)} 0.026 ${hue})`,
      line2: `oklch(${n(0.40 - f * 0.03)} 0.036 ${hue})`,
      rule: `oklch(0.460 0.070 ${hue})`,
      chip: `oklch(${n(0.29 - f * 0.025)} 0.032 ${hue})`,
      chipStrong: `oklch(${n(0.37 - f * 0.025)} 0.060 ${hue})`,
      hover: `oklch(${n(0.30 - f * 0.025)} 0.034 ${hue})`,
      track: `oklch(${n(0.32 - f * 0.03)} 0.028 ${hue})`,
      shadow: `oklch(0.10 0.04 ${hue} / 0.75)`,
    };
  }

  return {
    hue, isDark: false,
    text: `oklch(${n(0.23 - f * 0.02)} ${n(0.014 + f * 0.02)} ${hue})`,
    text2: `oklch(${n(0.36 - f * 0.02)} ${n(0.014 + f * 0.024)} ${hue})`,
    textSoft: `oklch(${n(0.47 - f * 0.02)} ${n(0.012 + f * 0.026)} ${hue})`,
    textMute: `oklch(${n(0.56 - f * 0.02)} ${n(0.010 + f * 0.026)} ${hue})`,
    accent: `oklch(${n(0.60 - f * 0.10)} ${n(0.11 + f * 0.09)} ${hue})`,
    accentText: `oklch(${n(0.50 - f * 0.08)} ${n(0.11 + f * 0.07)} ${hue})`,
    solid: `oklch(${n(0.34 - f * 0.06)} ${n(0.05 + f * 0.09)} ${hue})`,
    onSolid: `oklch(0.975 0.010 ${hue})`,
    bg: `oklch(${n(0.97 - f * 0.014)} ${n(0.005 + f * 0.02)} ${hue})`,
    bgFade: `oklch(${n(0.97 - f * 0.014)} ${n(0.005 + f * 0.02)} ${hue} / 0.88)`,
    wash: `linear-gradient(180deg, oklch(${n(0.93 - f * 0.155)} ${n(0.028 + f * 0.115)} ${hue}) 0%, oklch(${n(0.97 - f * 0.014)} ${n(0.005 + f * 0.02)} ${hue}) 100%)`,
    onWash: `oklch(${n(0.24 - f * 0.06)} ${n(0.03 + f * 0.05)} ${hue})`,
    onWashSoft: `oklch(${n(0.44 - f * 0.10)} ${n(0.03 + f * 0.055)} ${hue})`,
    line: `oklch(${n(0.90 - f * 0.03)} ${n(0.01 + f * 0.03)} ${hue})`,
    line2: `oklch(${n(0.86 - f * 0.04)} ${n(0.016 + f * 0.04)} ${hue})`,
    rule: `oklch(${n(0.85 - f * 0.05)} ${n(0.035 + f * 0.06)} ${hue})`,
    chip: `oklch(${n(0.94 - f * 0.03)} ${n(0.014 + f * 0.036)} ${hue})`,
    chipStrong: `oklch(${n(0.91 - f * 0.045)} ${n(0.032 + f * 0.07)} ${hue})`,
    hover: `oklch(${n(0.932 - f * 0.03)} ${n(0.014 + f * 0.034)} ${hue})`,
    track: `oklch(${n(0.90 - f * 0.03)} ${n(0.012 + f * 0.03)} ${hue})`,
    shadow: `oklch(0.50 ${n(0.10 + f * 0.09)} ${hue} / 0.55)`,
  };
}

export const themeFor = (mood: Mood) => paletteFor(mood.hue, mood.force, mood.dark);

/**
 * Cover art generated from the track's own measurements — energy sets contrast,
 * pace sets band width, vocals open the light in the middle — then rotated
 * around the session's hue so a queue reads as one family.
 */
export function artFor(track: Track, mood?: Mood, seedIndex = 0): string {
  const moodHue = mood?.hue ?? 250;
  const moodWarmth = mood?.dials.warmth ?? 50;
  const s = seedIndex;

  const drift = ((track.w - moodWarmth) / 100) * 90;
  const hue = Math.round((((moodHue + drift) % 360) + 360) % 360);
  const hue2 = (hue + 26 + (s % 3) * 14) % 360;
  const c = (0.045 + (track.w / 100) * 0.085).toFixed(3);
  const dark = (0.78 - (track.e / 100) * 0.3).toFixed(3);
  const light = (0.96 - (track.e / 100) * 0.14).toFixed(3);
  const bw = 3 + Math.round((1 - track.t / 100) * 11);
  const ang = 18 + ((s * 37) % 150);
  const bloom = Math.round(26 + (track.v / 100) * 48);
  const bx = 22 + ((s * 17) % 56);
  const by = 20 + ((s * 29) % 60);

  return [
    `radial-gradient(circle at ${bx}% ${by}%, oklch(0.99 0.02 ${hue} / 0.85) 0%, oklch(0.99 0.02 ${hue} / 0) ${bloom}%)`,
    `repeating-linear-gradient(${ang}deg, oklch(${dark} ${c} ${hue}) 0 ${bw}px, oklch(${light} ${c} ${hue2}) ${bw}px ${bw * 2}px)`,
  ].join(", ");
}
