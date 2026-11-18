/**
 * The swipe deck's motion, against the handoff's numbers (§4–5).
 */
import { describe, expect, it } from "vitest";

import {
  COMMIT_DISTANCE,
  SPRINGS,
  dragOffset,
  projectedDistance,
  releaseDecision,
  releaseVelocity,
  rubberBand,
  springSettled,
  springStep,
  stampOpacity,
  type SpringState,
} from "@/lib/swipe-physics";

describe("committing", () => {
  it("commits at 90", () => {
    expect(COMMIT_DISTANCE).toBe(90);
  });

  it("decides on where the flick lands, not where it let go", () => {
    // Released short of the line, but flicked hard enough to carry over it.
    expect(releaseDecision(40, 800)).toBe(1);
    expect(releaseDecision(-40, -800)).toBe(-1);
  });

  it("snaps back when the landing stays inside the line", () => {
    expect(releaseDecision(60, 0)).toBe(0);
    // Dragged past, then flung back towards the middle.
    expect(releaseDecision(100, -900)).toBe(0);
  });

  it("projects with iOS's fast deceleration", () => {
    expect(projectedDistance(1000)).toBeCloseTo(99, 5);
    expect(projectedDistance(0)).toBe(0);
  });

  it("reads velocity from the first and last pointer samples", () => {
    expect(releaseVelocity([[0, 0], [50, 25], [100, 50]])).toBe(500);
    expect(releaseVelocity([[0, 0]])).toBe(0);
    // Two samples on the same millisecond don't divide by zero.
    expect(Number.isFinite(releaseVelocity([[10, 0], [10, 30]]))).toBe(true);
  });
});

describe("dragging", () => {
  it("follows the finger 1:1 up to the commit point", () => {
    expect(dragOffset(50)).toBe(50);
    expect(dragOffset(-90)).toBe(-90);
  });

  it("resists past it, harder the further it goes", () => {
    const a = dragOffset(150) - COMMIT_DISTANCE;
    const b = dragOffset(250) - dragOffset(150);
    expect(a).toBeLessThan(60);
    expect(b).toBeLessThan(a);
    expect(dragOffset(-150)).toBe(-dragOffset(150));
  });

  it("rubber-bands with the handoff's constants", () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(100)).toBeCloseTo((100 * 120 * 0.55) / (120 + 55), 6);
  });

  it("fades the stamp in towards the commit point", () => {
    expect(stampOpacity(0)).toBe(0);
    expect(stampOpacity(45)).toBe(0.5);
    expect(stampOpacity(-180)).toBe(1);
  });
});

describe("springs", () => {
  const run = (state: SpringState, target: number, spring: { response: number; damping: number }) => {
    let s = state;
    for (let i = 0; i < 400 && !springSettled(s, target); i += 1) s = springStep(s, target, 1 / 60, spring);
    return s;
  };

  it("snaps back to rest from a release", () => {
    const end = run({ x: 80, v: 0 }, 0, SPRINGS.snapBack);
    expect(springSettled(end, 0)).toBe(true);
  });

  it("carries the release velocity into the spring", () => {
    const still = springStep({ x: 0, v: 0 }, 500, 1 / 60, SPRINGS.flyOff);
    const flung = springStep({ x: 0, v: 2000 }, 500, 1 / 60, SPRINGS.flyOff);
    expect(flung.x).toBeGreaterThan(still.x);
  });

  it("doesn't overshoot when critically damped", () => {
    let s: SpringState = { x: 0, v: 0 };
    let max = 0;
    for (let i = 0; i < 120; i += 1) {
      s = springStep(s, 100, 1 / 60, SPRINGS.flyOff);
      max = Math.max(max, s.x);
    }
    expect(max).toBeLessThanOrEqual(100.5);
  });

  it("clamps a long frame so a stalled tab can't fling the card", () => {
    const a = springStep({ x: 0, v: 0 }, 100, 5, SPRINGS.snapBack);
    const b = springStep({ x: 0, v: 0 }, 100, 0.032, SPRINGS.snapBack);
    expect(a).toEqual(b);
  });
});
