import { describe, expect, it } from "vitest";

import { resolveActiveBusiness } from "@/lib/api/post-auth";

/**
 * The business someone lands in after signing in.
 *
 * The bug this guards against: the old code only stored a business id when the
 * account had exactly one business. With two or more it stored nothing, every
 * request went out unscoped, and the backend picked its own default — so the
 * rail named one business while the figures under it came from another.
 *
 * "Agrees with the backend" is the property that matters most here. With no
 * `business_id` supplied, `sole-ocr/src/middleware/businessContext.js` orders
 * by `is_default DESC, id ASC` and takes the first — so picking the default
 * is what makes a stored id and an unstored one resolve to the same business.
 */
describe("resolveActiveBusiness", () => {
  it("prefers the account's default over list order", () => {
    const chosen = resolveActiveBusiness([
      { id: 7 },
      { id: 9, is_default: true },
      { id: 11 },
    ]);
    expect(chosen?.id).toBe(9);
  });

  it("accepts the numeric 1 the API sends for is_default", () => {
    // MySQL tinyint comes back as 1/0, not true/false, through Sequelize.
    const chosen = resolveActiveBusiness([{ id: 7 }, { id: 9, is_default: 1 }]);
    expect(chosen?.id).toBe(9);
  });

  it("falls back to the first openable business when none is marked default", () => {
    const chosen = resolveActiveBusiness([{ id: 4 }, { id: 5 }]);
    expect(chosen?.id).toBe(4);
  });

  it("skips a locked default rather than opening a business nobody can use", () => {
    const chosen = resolveActiveBusiness([
      { id: 1, is_default: true, is_locked: true },
      { id: 2 },
    ]);
    expect(chosen?.id).toBe(2);
  });

  it.each([
    ["is_locked", { id: 1, is_locked: true }],
    ["payment_status", { id: 1, payment_status: "locked" }],
    ["subscription_status", { id: 1, subscription_status: "locked" }],
  ])("treats %s as locked", (_label, business) => {
    expect(resolveActiveBusiness([business])).toBeNull();
  });

  it("is null when every business is locked, so the caller can send them to checkout", () => {
    expect(
      resolveActiveBusiness([
        { id: 1, is_locked: true },
        { id: 2, payment_status: "locked" },
      ]),
    ).toBeNull();
  });

  it("is null for an empty list", () => {
    expect(resolveActiveBusiness([])).toBeNull();
  });

  it("ignores a row with no id rather than storing undefined", () => {
    // A business with no id can't be opened and can't be stamped on a
    // request — storing it would send `business_id=undefined`.
    const chosen = resolveActiveBusiness([{ is_default: true }, { id: 3 }]);
    expect(chosen?.id).toBe(3);
  });
});
