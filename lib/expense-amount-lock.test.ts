import { describe, expect, it } from "vitest";

import { isAmountLocked } from "@/lib/expenses";

describe("isAmountLocked", () => {
  it("locks a matched expense — the Expenses list takes Edit away from it too", () => {
    expect(isAmountLocked({ status: "Matched" })).toBe(true);
  });

  it("locks a matched cash expense as well — cash and paid-with-cash read Matched and are held the same way", () => {
    // paymentMethod plays no part: the module doesn't tell cash apart either.
    expect(isAmountLocked({ status: "Matched", paymentMethod: "Cash" } as never)).toBe(true);
  });

  it("leaves an expense that isn't matched editable", () => {
    expect(isAmountLocked({ status: "Pending" })).toBe(false);
  });
});
