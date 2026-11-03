"use client";

import * as React from "react";

/**
 * Whether the person has asked for less motion.
 *
 * Starts false and settles after mount, so the server and the first client
 * render agree. Only timings should depend on it — anything visual is better
 * handled by the `prefers-reduced-motion` block in the stylesheet, which
 * applies before the first paint rather than after it.
 *
 * Shared from here rather than from the onboarding folder because Recharts is
 * the second caller: it animates in JavaScript, so the stylesheet's blanket
 * `animation-duration: 0.001ms` never reaches it and the preference has to be
 * read in JS and passed to `isAnimationActive`.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
