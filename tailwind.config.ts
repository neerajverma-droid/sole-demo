import type { Config } from "tailwindcss";
// A static import, not require(): this file is ESM, so require is undefined and
// PostCSS threw a ReferenceError while loading the config.
import tailwindcssAnimate from "tailwindcss-animate";

const config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          heading: "hsl(var(--primary-heading))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        hero: {
          DEFAULT: "hsl(var(--hero))",
          foreground: "hsl(var(--hero-foreground))",
          muted: "hsl(var(--hero-muted))",
          border: "hsl(var(--hero-border))",
          raised: "hsl(var(--hero-raised))",
        },
        warm: {
          DEFAULT: "hsl(var(--warm))",
          foreground: "hsl(var(--warm-foreground))",
        },
        chart: {
          in: "hsl(var(--chart-in))",
          out: "hsl(var(--chart-out))",
          "in-soft": "hsl(var(--chart-in-soft))",
          "out-soft": "hsl(var(--chart-out-soft))",
        },
        highlight: "hsl(var(--highlight))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        nudge: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "50%": { transform: "translate(2px, 4px)" },
        },
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        /*
         * View enter: page content settles in on mount. Uses `translate` for the
         * same reason as sole-pop below — and because a `transform` on the app
         * wrapper makes it the containing block for any fixed-position
         * descendant while the animation runs.
         */
        "sole-rise": {
          from: { opacity: "0", translate: "0 6px" },
          to: { opacity: "1", translate: "0 0" },
        },
        /*
         * The sparkle on the AI suggestions banner, breathing.
         *
         * `scale` on its own rather than the `transform` shorthand, for the same
         * reason sole-pop does it: the shorthand would wipe out anything else
         * the element carries in `transform`.
         */
        "ai-pulse": {
          "0%, 100%": { scale: "1" },
          "50%": { scale: "1.1" },
        },
        /*
         * Opacity rather than scale, unlike ai-pulse above: this one sits
         * inside a line of text, and a glyph that changed size would shift the
         * heading beside it on every beat.
         */
        "sparkle-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        /*
         * A list row leaving because it's been dealt with. Sideways rather
         * than up, so it reads as "off the list" instead of as the list
         * reflowing — and `translate` rather than `transform` for the same
         * reason as sole-rise.
         */
        "sole-clear": {
          from: { opacity: "1", translate: "0 0" },
          to: { opacity: "0", translate: "2rem 0" },
        },
        /*
         * Dialogs and popovers pop rather than fade.
         *
         * Animates the individual `scale` and `translate` properties, never the
         * `transform` shorthand. A centred dialog carries its own
         * translate(-50%, -50%) in `transform`, and a keyframe ending on
         * `transform: none` wiped that out permanently under
         * animation-fill-mode: both — which is what knocked every dialog and the
         * command palette off centre.
         */
        "sole-pop": {
          from: { opacity: "0", scale: "0.96", translate: "0 8px" },
          to: { opacity: "1", scale: "1", translate: "0 0" },
        },
        /* The matching exit, so closing doesn't fall back to a transform-based one. */
        "sole-unpop": {
          from: { opacity: "1", scale: "1" },
          to: { opacity: "0", scale: "0.98" },
        },
        /* The hero preview card breathes once it has settled. */
        "sole-sway": {
          "0%, 100%": { transform: "rotate(-2deg) translateY(0)" },
          "50%": { transform: "rotate(-1.4deg) translateY(-6px)" },
        },
        /* Dashed flow arrows read as moving. */
        "sole-flow": {
          to: { strokeDashoffset: "-12" },
        },
        /*
         * The auth promo's entrance. Animates `translate` and `scale`
         * individually rather than the `transform` shorthand — the mockup
         * carries its own rotate, and a keyframe writing `transform` would
         * wipe it out.
         */
        /* The shared entrance: fade up a little. Used by the auth panel and
  			   the onboarding celebration alike, hence the neutral name. */
        "fade-rise": {
          from: { opacity: "0", translate: "0 8px" },
          to: { opacity: "1", translate: "0 0" },
        },
        /* A slim bar sliding through its track, going nowhere — the wait is
  			   a fixed length, but the bar isn't measuring it. */
        "slide-through": {
          from: { translate: "-100% 0" },
          to: { translate: "340% 0" },
        },
        "auth-mockup-in": {
          from: { opacity: "0", translate: "0 16px", scale: "0.98" },
          to: { opacity: "1", translate: "0 0", scale: "1" },
        },
        /* The settled drift. Starts and ends at rest, so a truncated run
  			   under reduced motion lands where it began. */
        "auth-float": {
          "0%, 100%": { translate: "0 0" },
          "50%": { translate: "0 -6px" },
        },
        /*
         * Ambient glow motion — the slow drift and breathe behind the auth
         * promo panel. Two of them, moving in opposite directions over
         * different periods, because two blobs sliding the same way at the
         * same time reads as the whole panel moving rather than as light.
         *
         * Individual transform properties, never the `transform` shorthand,
         * so nothing else animating a transform on the same element gets
         * flattened into a matrix and lost. Transform and opacity only, both
         * compositor-friendly: no layout or paint per frame.
         *
         * Amplitudes are percentages of the blob's own box, which is 60–70%
         * of a half-width panel — so a 3–4% drift is roughly one per cent of
         * the viewport. Paired with `alternate`, each runs rest-to-rest, so a
         * truncated run under reduced motion lands somewhere composed.
         */
        "ambient-drift-a": {
          from: { translate: "0 0", scale: "1", opacity: "1" },
          to: { translate: "-3% 4%", scale: "1.05", opacity: "0.96" },
        },
        /* Up and to the right, against A, and breathing the other way. */
        "ambient-drift-b": {
          from: { translate: "0 0", scale: "1.04", opacity: "1" },
          to: { translate: "4% -2.5%", scale: "1", opacity: "0.92" },
        },
        "auth-pulse": {
          "0%, 100%": { scale: "1" },
          "50%": { scale: "1.06" },
        },
        /*
         * The celebration mark. The ring is drawn by animating its
         * stroke-dashoffset from the circle's own circumference (2πr, r=34)
         * down to zero; the check then pops on a spring curve.
         */
        "mark-draw": {
          from: { strokeDashoffset: "214" },
          to: { strokeDashoffset: "0" },
        },
        "mark-pop": {
          from: { opacity: "0", scale: "0.4" },
          to: { opacity: "1", scale: "1" },
        },
        /* Soft ring breathing out of the resolved lifecycle node. */
        "sole-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--success) / 0.30)" },
          "50%": { boxShadow: "0 0 0 5px hsl(var(--success) / 0)" },
        },
        /*
         * The "we found something" trio, for the AI match affordance.
         *
         * Slow enough to be a state rather than an alarm — the button is
         * saying a suggestion is ready, not that something is wrong. The
         * gradient slides across an over-wide background, the glow breathes
         * on opacity and scale rather than box-shadow (cheaper to composite,
         * and it can sit behind the button instead of on it), and the
         * sparkle only dips in opacity.
         */
        "ai-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "ai-glow": {
          "0%, 100%": { opacity: "0.45", transform: "scale(0.97)" },
          "50%": { opacity: "0.8", transform: "scale(1.05)" },
        },
        "ai-twinkle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        /*
         * The light sweeping across a loading block. `translate` alone, not
         * `transform` — same reasoning as the rest of this file — moving a
         * full-width gradient from just off its left edge to just off its
         * right, so the sweep clears the block once per pass.
         */
        shimmer: {
          from: { translate: "-100% 0" },
          to: { translate: "100% 0" },
        },
        /*
         * The streak flame on Quick Actions, idling.
         *
         * Both channels together — a glow that only changed size reads as a
         * throb, and one that only faded reads as a fault. `scale` rather than
         * the `transform` shorthand for the same reason as sole-pop.
         */
        "sole-ember": {
          "0%, 100%": { opacity: "0.75", scale: "0.96" },
          "50%": { opacity: "1", scale: "1.06" },
        },
        /*
         * The goal ring closing. Overshoots by six percent and settles, which
         * is the smallest movement that still reads as the ring reacting rather
         * than as the layout shifting.
         */
        "sole-goal-pop": {
          "0%, 100%": { scale: "1" },
          "50%": { scale: "1.06" },
        },
      },
      animation: {
        nudge: "nudge 2.4s ease-in-out infinite",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        rise: "sole-rise 0.28s cubic-bezier(0.23, 1, 0.32, 1) both",
        /* Accelerates out — the row is going, not arriving. */
        clear: "sole-clear 0.2s cubic-bezier(0.4, 0, 1, 1) both",
        /* Two seconds, which is slow enough to read as breathing. */
        "ai-pulse": "ai-pulse 2s ease-in-out infinite",
        "sparkle-pulse": "sparkle-pulse 2s ease-in-out infinite",
        /*
         * The same fade-up as `fade-rise`, quicker and with a plain ease-out —
         * a card in a staggered grid is one of several arriving, so it wants
         * less character than a panel arriving alone. Reuses the keyframe
         * rather than declaring a second one that would drift from it.
         */
        "card-rise": "fade-rise 0.3s ease-out both",
        /*
         * The check landing in a card's corner. `mark-pop`'s spring, at a
         * quarter of a second — the success mark it was written for is the
         * whole screen, and this is a 12px glyph.
         */
        "check-pop": "mark-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        /*
         * First run's two micro-motions, both under the 200ms ceiling that
         * surface holds itself to: nothing in a flow someone can't leave may
         * make them wait to see what they just did.
         *
         * `step-in` is a step card arriving — the same fade-up as `fade-rise`
         * at a third of its length, because a modal swapping its contents is a
         * smaller event than a panel arriving on an empty screen.
         *
         * `check-in` is the tick on a chosen option. `check-pop`'s spring,
         * quicker again: that one lands in a card corner after something
         * completed, this one is acknowledging a tap and must not still be
         * moving when the next one comes.
         *
         * Both reuse existing keyframes rather than declaring near-copies that
         * would drift from them.
         */
        "step-in": "fade-rise 0.18s ease-out both",
        "check-in": "mark-pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        pop: "sole-pop 0.28s cubic-bezier(0.23, 1, 0.32, 1) both",
        unpop: "sole-unpop 0.16s ease-out both",
        sway: "sole-rise 0.4s cubic-bezier(0.23, 1, 0.32, 1) both, sole-sway 6s ease-in-out 0.4s infinite",
        flow: "sole-flow 0.9s linear infinite",
        glow: "sole-glow 2.4s ease-in-out infinite",
        "fade-rise": "fade-rise 0.5s cubic-bezier(0.23, 1, 0.32, 1) both",
        "slide-through": "slide-through 1.2s ease-in-out infinite",
        "auth-mockup-in":
          "auth-mockup-in 0.6s cubic-bezier(0.23, 1, 0.32, 1) both",
        "auth-float": "auth-float 6s ease-in-out infinite",
        /*
         * Long enough to be weather rather than animation: at 22 and 28
         * seconds the two never come back into phase inside a session, and
         * neither is quick enough to catch the eye mid-form.
         */
        "ambient-drift-a": "ambient-drift-a 22s ease-in-out infinite alternate",
        "ambient-drift-b": "ambient-drift-b 28s ease-in-out infinite alternate",
        "auth-pulse": "auth-pulse 6s ease-in-out infinite",
        "mark-draw": "mark-draw 0.7s cubic-bezier(0.65, 0, 0.35, 1) both",
        /* Overshoots, then settles — the spring the brief asks for. */
        "mark-pop": "mark-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "ai-shift": "ai-shift 3s ease-in-out infinite",
        "ai-glow": "ai-glow 3s ease-in-out infinite",
        "ai-twinkle": "ai-twinkle 3s ease-in-out infinite",
        /* Slower than the AI trio, because nothing is waiting on it. */
        ember: "sole-ember 3.2s ease-in-out infinite",
        /* Once, on arrival — no fill mode, so it leaves the ring where it
           found it. */
        "goal-pop": "sole-goal-pop 0.45s ease-out",
        /* Only on hover, and slow enough to read as drift, not spin. */
        "ai-turn": "spin 6s linear infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;

export default config;
