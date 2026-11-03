"use client";

import * as React from "react";

/** Honours the OS setting without needing a media-query CSS hook. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Counts a figure up on first paint, then leaves it alone. Renders the final
 * value on the server and for anyone who's asked for reduced motion, so the
 * number is never wrong or missing.
 */
export function CountUp({
  value,
  format,
  duration = 650,
}: {
  value: number;
  /** Formats the in-flight value — money, percent, plain. */
  format?: (value: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = React.useState(value);
  const started = React.useRef(false);

  React.useEffect(() => {
    /**
     * Once the opening count-up has run, the figure simply follows the data.
     *
     * It used to return here without setting anything, which meant `shown` kept
     * whatever it was seeded with on mount — so a summary that stayed mounted
     * while its list changed went on showing the old number. Deleting a contact
     * left the count where it was, and the preview toggle emptied a table while
     * the figures above it still read as though nothing had happened.
     *
     * Following rather than re-animating is deliberate: a figure that counts
     * itself up again on every keystroke reads as though it's fighting you.
     */
    if (started.current || prefersReducedMotion() || value === 0) {
      setShown(value);
      return;
    }
    started.current = true;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // Ease out, so it decelerates into the real figure.
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  // Keep the settled value exact — easing can land a hair short.
  const display = shown === value ? value : shown;
  return <>{format ? format(display) : Math.round(display)}</>;
}
