import { describe, expect, it } from "vitest";

import { ADDONS } from "@/lib/addons";
import { gateForPath, PLAN_GATES } from "@/lib/plan-gates";

describe("gateForPath", () => {
  it("matches a gated route and the pages under it", () => {
    expect(gateForPath("/km-tracker")?.feature).toBe("km-tracker");
    expect(gateForPath("/km-tracker/reports")?.feature).toBe("km-tracker");
    expect(gateForPath("/transactions/rules?tab=1")?.feature).toBe("transactions");
    expect(gateForPath("/booking-links#new")?.feature).toBe("booking");
  });

  it("matches whole segments only", () => {
    expect(gateForPath("/projects-archive")).toBeUndefined();
    expect(gateForPath("/inventory-report")).toBeUndefined();
  });

  it("leaves every-plan pages open", () => {
    for (const path of ["/dashboard", "/reports/profit-loss", "/invoices", undefined]) {
      expect(gateForPath(path)).toBeUndefined();
    }
  });

  it("puts payroll behind its seats, not a feature key", () => {
    const gate = gateForPath("/payroll/employees");
    expect(gate?.seats).toBe(true);
    expect(gate?.feature).toBeUndefined();
  });

  it("points each sellable gate at the add-on card that unlocks the same feature", () => {
    for (const gate of PLAN_GATES.filter((entry) => entry.addonId)) {
      const addon = ADDONS.find((entry) => entry.id === gate.addonId);
      expect(addon?.feature).toBe(gate.feature);
    }
  });
});
