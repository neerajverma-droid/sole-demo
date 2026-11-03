import { cn } from "@/lib/utils";

/**
 * The hero's cover.
 *
 * Portrait, and the only one with no wash of its own: it sits directly on the
 * hero's indigo gradient and is drawn entirely in translucent white, which is
 * what "seamlessly integrated" has to mean — an opaque panel with its own
 * background would be a picture stuck onto a gradient rather than part of it.
 *
 * Same rising columns as the Growth cover, so the hero belongs to the set it
 * leads, plus a ring-and-slash percent for the subject and one amber note.
 */
export function TaxEstimatorCover({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 320"
      preserveAspectRatio="xMidYMid slice"
      className={cn("h-full w-full", className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id="rc-tax-orb" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="34" cy="44" r="128" fill="url(#rc-tax-orb)" />

      <circle
        cx="132"
        cy="76"
        r="34"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="6"
        opacity="0.55"
      />
      <circle cx="120" cy="64" r="7" fill="#FFFFFF" opacity="0.85" />
      <circle cx="144" cy="88" r="7" fill="#FFFFFF" opacity="0.85" />
      <path
        d="M110 94 L154 58"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.85"
      />

      <rect
        x="34"
        y="200"
        width="36"
        height="76"
        rx="13"
        fill="#FFFFFF"
        opacity="0.28"
      />
      <rect
        x="82"
        y="166"
        width="36"
        height="110"
        rx="13"
        fill="#FFFFFF"
        opacity="0.45"
      />
      <rect
        x="130"
        y="126"
        width="36"
        height="150"
        rx="13"
        fill="#FFFFFF"
        opacity="0.72"
      />

      <circle cx="56" cy="140" r="11" fill="#FBBF24" opacity="0.9" />
    </svg>
  );
}
