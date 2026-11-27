/**
 * Small shared helpers for the demo seed: a seedable PRNG and date maths that
 * are anchored to a given "today", so every demo looks current whenever it is
 * opened and the same seed always yields the same story.
 */

/** Mulberry32 PRNG for stable, reproducible demo values. */
export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(arr: T[]) => T;
  chance: (p: number) => boolean;
  money: (min: number, max: number) => number;
}

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    money: (min, max) => Math.round((min + next() * (max - min)) * 100) / 100,
  };
}

/** A small stable hash of a string, for picking per-industry flavour deterministically. */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface DateHelpers {
  /** The anchor ("today") as YYYY-MM-DD. */
  today: string;
  addDaysIso: (days: number) => string;
  addMonthsIso: (months: number, dayOfMonth?: number) => string;
}

/** Date helpers pinned to `anchor` (noon UTC, so DST/timezone can't shift the day). */
export function makeDates(anchor: Date = new Date()): DateHelpers {
  const base = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate(), 12),
  );
  return {
    today: base.toISOString().slice(0, 10),
    addDaysIso(days) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    },
    addMonthsIso(months, dayOfMonth = 1) {
      const d = new Date(base);
      d.setUTCDate(1); // avoid month-end overflow when shifting months
      d.setUTCMonth(d.getUTCMonth() + months);
      d.setUTCDate(dayOfMonth);
      return d.toISOString().slice(0, 10);
    },
  };
}
