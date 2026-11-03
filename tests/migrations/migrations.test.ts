import { describe, expect, it } from "vitest";

import { MIGRATION_HREF, MIGRATION_STEPS, migrationStep } from "@/lib/migrations";

describe("MIGRATION_STEPS", () => {
  it("lists the five steps in the least-rework order, numbered 1–5", () => {
    expect(MIGRATION_STEPS.map((step) => [step.order, step.id])).toEqual([
      [1, "transactions"],
      [2, "contacts"],
      [3, "invoices"],
      [4, "expenses"],
      [5, "assets"],
    ]);
  });

  it("routes only Bank Transactions; every other step opens its own dialog", () => {
    expect(MIGRATION_STEPS.map((step) => step.target)).toEqual([
      { kind: "route", href: "/transactions/bulk" },
      { kind: "dialog", dialog: "contacts" },
      { kind: "dialog", dialog: "invoices" },
      { kind: "dialog", dialog: "expenses" },
      { kind: "dialog", dialog: "assets" },
    ]);
  });

  it("gives every step a title, description, icon and noun", () => {
    for (const step of MIGRATION_STEPS) {
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
      expect(step.noun).toBeTruthy();
      expect(step.icon).toBeTruthy();
    }
  });

  it("has unique ids", () => {
    const ids = MIGRATION_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lives at /migrations", () => {
    expect(MIGRATION_HREF).toBe("/migrations");
  });
});

describe("migrationStep", () => {
  it("finds a step by id", () => {
    expect(migrationStep("expenses").title).toBe("Expenses");
  });

  it("falls back to the first step for an unknown id", () => {
    expect(migrationStep("payroll" as never)).toBe(MIGRATION_STEPS[0]);
  });
});
