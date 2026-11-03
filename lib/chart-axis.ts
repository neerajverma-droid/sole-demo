/**
 * Money on a chart axis: the tick labels, and the bounds that make them land on
 * round numbers.
 *
 * Pure arithmetic on purpose — an axis that picks $63,408 / $71,112 as its ticks
 * is worse than no axis, and that's the sort of thing worth a test rather than
 * an eyeball.
 */

import { activeCurrencySymbol } from "@/lib/country-context";

/**
 * `$0`, `$450`, `$67k`, `$1.2m` — short enough to sit in an axis gutter.
 *
 * Not `lib/dashboard-data.ts`'s `money`: that one spells the figure out in full
 * for the places a number is read exactly (the hero, a tile, a tooltip). An axis
 * label is read for scale, and five of them at `$66,908` wide is a gutter that
 * costs more than the plot.
 *
 * One decimal below 10 units, none above — `$1.2m` says something `$1m` doesn't,
 * while `$67.4k` is noise next to `$67k`.
 */
export function axisMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  const symbol = activeCurrencySymbol();
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    return `${sign}${symbol}${millions >= 10 ? Math.round(millions) : round1(millions)}m`;
  }

  if (abs >= 1_000) {
    const thousands = abs / 1_000;
    return `${sign}${symbol}${thousands >= 10 ? Math.round(thousands) : round1(thousands)}k`;
  }

  return `${sign}${symbol}${Math.round(abs)}`;
}

/** 1.0 → "1", 1.25 → "1.3" — a trailing ".0" is a digit that says nothing. */
function round1(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** 1, 2, 2.5 or 5 × a power of ten — the steps people actually read. */
function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Bounds and ticks for a money axis, rounded outwards to a round step.
 *
 * Anchored at zero whenever the data is positive, because this is drawn as an
 * AREA: the filled region reads as magnitude, and a fill that starts at
 * $64,000 draws a small balance as a tall block. A line chart could honestly
 * zoom; a filled one cannot.
 *
 * Negative values extend the axis downwards rather than clipping — an overdrawn
 * balance is exactly the case someone needs to see.
 *
 * @param tickCount how many intervals to aim for; the real count lands near it
 *   once the step has been rounded to something readable.
 */
export function niceMoneyDomain(
  values: number[],
  tickCount = 4,
): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter((value) => Number.isFinite(value));

  // Nothing to scale to. A 0–100 axis keeps the gutter the same width as it
  // will be once data arrives, so the plot doesn't jump when it does.
  if (finite.length === 0) {
    return { domain: [0, 100], ticks: [0, 50, 100] };
  }

  const max = Math.max(...finite, 0);
  const min = Math.min(...finite, 0);

  // A single flat series at zero has no range to step over.
  if (max === min) {
    return { domain: [0, 100], ticks: [0, 50, 100] };
  }

  const step = niceStep((max - min) / Math.max(1, tickCount));
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  // `toFixed` guards the float drift that turns 0.1 + 0.2 into 0.30000000000000004
  // and so puts a tick at $20,000.000000001.
  for (let tick = low; tick <= high + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }

  return { domain: [low, high], ticks };
}
