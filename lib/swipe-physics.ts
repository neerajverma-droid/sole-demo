/**
 * The swipe deck's motion, from the Quick Actions handoff (§4–5).
 *
 * Three small pieces so the gesture can feel physical without a library:
 * where a flick is headed (momentum projection), how far past the commit point
 * the card is allowed to go (rubber band), and a critically damped spring that
 * takes the release velocity with it. Pure numbers — the card applies them.
 */

/** Distance (px) that arms a commit — measured at the projected landing. */
export const COMMIT_DISTANCE = 90;

/** Movement (px) before the gesture decides it's horizontal. */
export const AXIS_LOCK = 8;

/** Degrees of tilt per pixel dragged. */
export const ROTATION_PER_PX = 1 / 24;

/** Card scale while pressed — on pointer down, not release. */
export const PRESS_SCALE = 0.985;

/** Springs from the handoff: response in seconds, damping ratio. */
export const SPRINGS = {
  flyOff: { response: 0.34, damping: 1 },
  snapBack: { response: 0.38, damping: 0.85 },
  nudge: { response: 0.45, damping: 0.8 },
} as const;

/** Where the nudge peeks to on first run. */
export const NUDGE_DISTANCE = 46;

/**
 * Where a flick will land, from its release velocity (px/s):
 * `(v / 1000) * d / (1 - d)`, d = 0.99 — iOS's fast deceleration rate.
 */
export const projectedDistance = (velocity: number, deceleration = 0.99) =>
  ((velocity / 1000) * deceleration) / (1 - deceleration);

/** Overshoot past the commit point, resisting harder the further it goes. */
export const rubberBand = (overshoot: number, dimension = 120, constant = 0.55) =>
  (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));

/** The card's offset for a raw drag: 1:1 up to the commit point, rubber-banded after. */
export function dragOffset(raw: number): number {
  if (Math.abs(raw) <= COMMIT_DISTANCE) return raw;
  return Math.sign(raw) * (COMMIT_DISTANCE + rubberBand(Math.abs(raw) - COMMIT_DISTANCE));
}

/** What a release decides: approve (1), later (-1), or snap back (0). */
export function releaseDecision(offset: number, velocity: number): 1 | -1 | 0 {
  const landing = offset + projectedDistance(velocity);
  if (landing > COMMIT_DISTANCE) return 1;
  if (landing < -COMMIT_DISTANCE) return -1;
  return 0;
}

/** How far a stamp has faded in: 0 at rest, 1 at the commit point. */
export const stampOpacity = (offset: number) => Math.min(1, Math.abs(offset) / COMMIT_DISTANCE);

/** Release velocity (px/s) from the last few pointer samples `[time ms, x]`. */
export function releaseVelocity(samples: ReadonlyArray<readonly [number, number]>): number {
  if (samples.length < 2) return 0;
  const [t0, x0] = samples[0];
  const [t1, x1] = samples[samples.length - 1];
  return ((x1 - x0) / Math.max(1, t1 - t0)) * 1000;
}

export type SpringState = { x: number; v: number };

/**
 * One step of a damped spring towards `target`. Stiffness `(2π/response)²`,
 * damping `2ζ√k` — the same constants SwiftUI and Compose take, so the web
 * card moves as the native ones do.
 */
export function springStep(
  state: SpringState,
  target: number,
  dt: number,
  { response, damping }: { response: number; damping: number },
): SpringState {
  const k = ((2 * Math.PI) / response) ** 2;
  const c = 2 * damping * Math.sqrt(k);
  const step = Math.min(0.032, Math.max(0, dt));
  const v = state.v + (-k * (state.x - target) - c * state.v) * step;
  return { x: state.x + v * step, v };
}

/** Close enough to stop: within half a pixel and nearly still. */
export const springSettled = (state: SpringState, target: number) =>
  Math.abs(state.x - target) < 0.4 && Math.abs(state.v) < 10;
