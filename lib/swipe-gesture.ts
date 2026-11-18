/**
 * The swipe deck's gesture, as plain state: what each pointer event means for
 * the card. The deck feeds it window-level pointer events and does what it
 * answers — paint at `x`, open the breakdown on a tap, or settle a release.
 * Kept out of the component so every path (a tap, a sideways drag, a vertical
 * scroll, a mouse let go off the card) can be tested without a DOM.
 */
import { AXIS_LOCK, dragOffset, releaseDecision, releaseVelocity } from "@/lib/swipe-physics";

/** Only movement this recent (ms) counts towards the release velocity. */
export const VELOCITY_WINDOW_MS = 100;
const MAX_SAMPLES = 6;

export type GestureStart = {
  pointerId: number;
  x: number;
  y: number;
  /** Where the card already is (it can be grabbed mid-spring). */
  offset: number;
  /** Pressed on a tick, a link or a button. */
  fromControl: boolean;
};

export type GestureMove = {
  pointerId: number;
  x: number;
  y: number;
  time: number;
  pointerType: string;
  /** Buttons held — 0 on a mouse means it was let go where we couldn't hear. */
  buttons: number;
};

export type GestureEnd = {
  pointerId: number;
  type: "pointerup" | "pointercancel" | "pointermove";
  time: number;
  /** Whether the release landed on the card. */
  onCard: boolean;
};

export type MoveResult =
  | { kind: "ignore" }
  | { kind: "paint"; x: number }
  /** The mouse button is already up: finish as a release. */
  | { kind: "end" };

export type EndResult =
  | { kind: "ignore" }
  /** A tap on the card itself: open the breakdown. */
  | { kind: "tap" }
  /** Pressed and let go without dragging, on a control or off the card: nothing of ours. */
  | { kind: "none" }
  /** A drag let go: `decision` 1 approve, -1 later, 0 snap back. */
  | { kind: "release"; x: number; velocity: number; decision: 1 | -1 | 0 };

export type Gesture = {
  pointerId: number;
  originX: number;
  startX: number;
  startY: number;
  engaged: boolean;
  fromControl: boolean;
  x: number;
  samples: [number, number][];
};

export function startGesture({ pointerId, x, y, offset, fromControl }: GestureStart): Gesture {
  return {
    pointerId,
    originX: x - offset,
    startX: x,
    startY: y,
    engaged: false,
    fromControl,
    x: offset,
    samples: [],
  };
}

/** A pointer moved. Mutates `gesture`. */
export function moveGesture(gesture: Gesture, move: GestureMove): MoveResult {
  if (move.pointerId !== gesture.pointerId) return { kind: "ignore" };
  if (move.pointerType === "mouse" && move.buttons === 0) return { kind: "end" };
  if (!gesture.engaged) {
    const dx = move.x - gesture.startX;
    const dy = move.y - gesture.startY;
    // Vertical scroll wins until the drag is plainly sideways.
    if (Math.abs(dx) < AXIS_LOCK || Math.abs(dx) < Math.abs(dy)) return { kind: "ignore" };
    gesture.engaged = true;
  }
  gesture.x = dragOffset(move.x - gesture.originX);
  gesture.samples.push([move.time, gesture.x]);
  if (gesture.samples.length > MAX_SAMPLES) gesture.samples.shift();
  return { kind: "paint", x: gesture.x };
}

/** The pointer was let go (or the browser took it). */
export function endGesture(gesture: Gesture, end: GestureEnd): EndResult {
  if (end.pointerId !== gesture.pointerId) return { kind: "ignore" };
  if (!gesture.engaged) {
    return end.type === "pointerup" && end.onCard && !gesture.fromControl ? { kind: "tap" } : { kind: "none" };
  }
  // Dragged, held still, then let go is a slow release, not the flick it was earlier.
  const recent = gesture.samples.filter(([time]) => end.time - time < VELOCITY_WINDOW_MS);
  const velocity = releaseVelocity(recent);
  return { kind: "release", x: gesture.x, velocity, decision: releaseDecision(gesture.x, velocity) };
}
