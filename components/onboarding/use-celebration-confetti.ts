"use client";

import * as React from "react";

/** Indigo, the warm accent, and a light neutral — the brand, not a rainbow. */
const COLOURS = ["#4D4DFE", "#F97316", "#E6E6F5"];

/** How long the particles may stay in flight before the canvas is released. */
const DURATION_MS = 2500;

/**
 * The confetti burst on arrival.
 *
 * One burst, wide and upward from the foot of the screen, and that's it. The
 * screen is already moving through its own sequence; a second volley would be
 * competing with it rather than adding to it.
 *
 * Skipped entirely under `prefers-reduced-motion`, which is checked here rather
 * than left to CSS: a canvas animation can't be turned off by a stylesheet, so
 * the only way to honour the preference is not to start.
 *
 * The library is imported dynamically so it never lands in the bundle of any
 * screen that doesn't celebrate.
 */
export function useCelebrationConfetti() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;

      confetti({
        particleCount: 140,
        spread: 100,
        startVelocity: 52,
        gravity: 0.95,
        ticks: 200,
        scalar: 1,
        disableForReducedMotion: true,
        colors: COLOURS,
        origin: { x: 0.5, y: 0.95 },
      });

      // Clears any particles still in flight and releases the canvas.
      timers.push(
        setTimeout(() => {
          if (!cancelled) confetti.reset();
        }, DURATION_MS),
      );
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);
}
