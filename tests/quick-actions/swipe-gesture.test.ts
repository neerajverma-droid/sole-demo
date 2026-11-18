// @vitest-environment node
/**
 * Quick Actions "Today" — the swipe gesture, pointer event by pointer event.
 *
 * Guards the mouse bug: the card stayed stuck to the cursor when the button
 * was let go off the card, couldn't be grabbed by its line items, and judged a
 * held-then-released drag by its earlier speed.
 */
import { describe, expect, it } from "vitest";

import { endGesture, moveGesture, startGesture, type Gesture } from "@/lib/swipe-gesture";
import { AXIS_LOCK, COMMIT_DISTANCE } from "@/lib/swipe-physics";

const ID = 1;
const start = (over: Partial<Parameters<typeof startGesture>[0]> = {}) =>
  startGesture({ pointerId: ID, x: 200, y: 300, offset: 0, fromControl: false, ...over });

const move = (g: Gesture, x: number, time: number, over: Partial<Parameters<typeof moveGesture>[1]> = {}) =>
  moveGesture(g, { pointerId: ID, x, y: 300, time, pointerType: "mouse", buttons: 1, ...over });

const up = (g: Gesture, time: number, over: Partial<Parameters<typeof endGesture>[1]> = {}) =>
  endGesture(g, { pointerId: ID, type: "pointerup", time, onCard: true, ...over });

/** Drag steadily from 200 to `to`, one event every 16ms, starting at t=0. */
function dragTo(g: Gesture, to: number, steps = 10) {
  let t = 0;
  for (let i = 1; i <= steps; i++) {
    t = i * 16;
    move(g, 200 + ((to - 200) * i) / steps, t);
  }
  return t;
}

describe("a tap", () => {
  it("on the card opens the breakdown", () => {
    expect(up(start(), 50)).toEqual({ kind: "tap" });
  });

  it("with a wobble under the axis lock is still a tap", () => {
    const g = start();
    expect(move(g, 200 + AXIS_LOCK - 1, 10)).toEqual({ kind: "ignore" });
    expect(up(g, 20)).toEqual({ kind: "tap" });
  });

  it("on a tick, a link or a button is left to that control", () => {
    expect(up(start({ fromControl: true }), 50)).toEqual({ kind: "none" });
  });

  it("let go off the card isn't a tap", () => {
    expect(up(start(), 50, { onCard: false })).toEqual({ kind: "none" });
  });

  it("taken by the browser (pointercancel) isn't a tap", () => {
    expect(up(start(), 50, { type: "pointercancel" })).toEqual({ kind: "none" });
  });
});

describe("dragging", () => {
  it("starts once the pointer is plainly sideways", () => {
    const g = start();
    expect(move(g, 200 + AXIS_LOCK, 16)).toEqual({ kind: "paint", x: AXIS_LOCK });
    expect(g.engaged).toBe(true);
  });

  it("leaves a vertical move to the page scroll", () => {
    const g = start();
    expect(move(g, 212, 16, { y: 340 })).toEqual({ kind: "ignore" });
    expect(g.engaged).toBe(false);
  });

  it("starts from a line item too — a drag from a tick still moves the card", () => {
    const g = start({ fromControl: true });
    expect(move(g, 260, 16).kind).toBe("paint");
    expect(up(g, 32).kind).toBe("release");
  });

  it("follows the pointer 1:1 to the commit point, then resists", () => {
    const g = start();
    expect(move(g, 200 + COMMIT_DISTANCE, 16)).toEqual({ kind: "paint", x: COMMIT_DISTANCE });
    const far = move(g, 200 + COMMIT_DISTANCE + 200, 32);
    expect(far.kind === "paint" && far.x).toBeGreaterThan(COMMIT_DISTANCE);
    expect(far.kind === "paint" && far.x).toBeLessThan(COMMIT_DISTANCE + 200);
  });

  it("picks a card up where it is, mid-spring", () => {
    const g = start({ offset: 40 });
    expect(move(g, 220, 16)).toEqual({ kind: "paint", x: 60 });
  });

  it("ignores another finger", () => {
    const g = start();
    expect(move(g, 300, 16, { pointerId: 2 })).toEqual({ kind: "ignore" });
    expect(up(g, 32, { pointerId: 2 })).toEqual({ kind: "ignore" });
  });
});

describe("letting go", () => {
  it("past the commit point to the right approves", () => {
    const g = start();
    const t = dragTo(g, 200 + 150);
    expect(up(g, t)).toMatchObject({ kind: "release", decision: 1 });
  });

  it("past the commit point to the left saves for later", () => {
    const g = start();
    const t = dragTo(g, 200 - 150);
    expect(up(g, t)).toMatchObject({ kind: "release", decision: -1 });
  });

  it("short of it, slowly, snaps back", () => {
    const g = start();
    move(g, 230, 16);
    expect(up(g, 2000)).toMatchObject({ kind: "release", decision: 0, velocity: 0 });
  });

  it("a short fast flick approves on momentum", () => {
    const g = start();
    move(g, 210, 0);
    move(g, 240, 16);
    move(g, 270, 32);
    expect(up(g, 40)).toMatchObject({ kind: "release", decision: 1 });
  });

  it("dragged fast, then held still before letting go, is judged by the hold — no surprise approve", () => {
    const g = start();
    move(g, 210, 0);
    move(g, 240, 16);
    move(g, 270, 32); // 60px out, moving fast
    const result = up(g, 32 + 600); // held for 600ms, then let go
    expect(result).toMatchObject({ kind: "release", velocity: 0, decision: 0 });
  });

  it("off the card still ends a drag that was under way", () => {
    const g = start();
    const t = dragTo(g, 400);
    expect(up(g, t, { onCard: false })).toMatchObject({ kind: "release", decision: 1 });
  });
});

describe("a mouse let go where the card couldn't hear it", () => {
  it("ends the drag on the next move with no button held — the card doesn't stay stuck to the cursor", () => {
    const g = start();
    move(g, 260, 16);
    expect(move(g, 280, 400, { buttons: 0 })).toEqual({ kind: "end" });
    expect(g.x).toBe(60); // not dragged to the new spot
  });

  it("then settles it by where the card was", () => {
    const g = start();
    move(g, 230, 16);
    move(g, 240, 1000, { buttons: 0 });
    expect(up(g, 1000, { type: "pointermove" })).toMatchObject({ kind: "release", decision: 0 });
  });

  it("also ends a press that never became a drag, without opening anything", () => {
    const g = start();
    expect(move(g, 203, 16, { buttons: 0 })).toEqual({ kind: "end" });
    expect(up(g, 16, { type: "pointermove" })).toEqual({ kind: "none" });
  });

  it("doesn't apply to touch, which reports no buttons while moving on some devices", () => {
    const g = start();
    expect(move(g, 260, 16, { pointerType: "touch", buttons: 0 }).kind).toBe("paint");
  });
});
