"use client";

/**
 * The success mark: a soft glow, a ring that draws itself, then a check that
 * pops on a spring once the ring has closed.
 *
 * White, because it sits on the brand gradient — an indigo mark on an indigo
 * field would be invisible.
 *
 * The ring is one SVG circle whose stroke-dashoffset animates from its own
 * circumference to zero — 2πr with r=34 is ~214, which is where the keyframe's
 * starting offset comes from. Under reduced motion the stylesheet collapses
 * both animations, and `both` fill mode is what guarantees the ring and the
 * check land on their final frame rather than being left half-drawn.
 */
export function SuccessMark() {
  return (
    <div className="relative grid size-28 place-items-center" aria-hidden>
      {/* The glow sits behind everything and doesn't animate — it's the light
          the mark sits in, not part of the gesture. */}
      <span className="absolute inset-0 rounded-full bg-white/25 blur-2xl" />
      <span className="absolute inset-4 rounded-full bg-white/10" />

      <svg viewBox="0 0 80 80" className="relative size-24" role="presentation">
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="3"
        />
        {/* Rotated so the ring draws from twelve o'clock. */}
        <circle
          className="animate-mark-draw origin-center -rotate-90"
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="214"
        />
        {/* Lands after the ring has closed — the delay is the whole sequence. */}
        <path
          className="animate-mark-pop origin-center"
          style={{ animationDelay: "0.55s" }}
          d="M26 41.5 L36 51 L55 31"
          fill="none"
          stroke="#fff"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
