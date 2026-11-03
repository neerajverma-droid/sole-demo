import { describe, expect, it } from "vitest";

import {
  JOIN_FROM_OPTIONS,
  findJoinFromOption,
  joinFromNeedsMigration,
  migrationRouteForJoinFrom,
} from "@/lib/onboarding-survey/join-from";

describe("JOIN_FROM_OPTIONS", () => {
  it("has source's exact eight labels, in source's order", () => {
    expect(JOIN_FROM_OPTIONS.map((o) => o.label)).toEqual([
      "First time user",
      "Spreadsheets",
      "Xero",
      "QuickBooks",
      "Rounded",
      "Okke",
      "Hnry",
      "Myob",
    ]);
  });

  it("gives every option a stable, unique id", () => {
    const ids = JOIN_FROM_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it("keeps every label within 20 characters (users.join_from is VARCHAR(20))", () => {
    for (const option of JOIN_FROM_OPTIONS) {
      expect(option.label.length).toBeLessThanOrEqual(20);
    }
  });
});

describe("migrationRouteForJoinFrom", () => {
  it("routes the direct-importer platforms to 'direct'", () => {
    expect(migrationRouteForJoinFrom("xero")).toBe("direct");
    expect(migrationRouteForJoinFrom("quickbooks")).toBe("direct");
    expect(migrationRouteForJoinFrom("myob")).toBe("direct");
  });

  it("routes spreadsheets to 'spreadsheet'", () => {
    expect(migrationRouteForJoinFrom("spreadsheets")).toBe("spreadsheet");
  });

  it("routes first-time-user to 'none'", () => {
    expect(migrationRouteForJoinFrom("first-time-user")).toBe("none");
  });

  it("routes the other named tools to 'file'", () => {
    expect(migrationRouteForJoinFrom("rounded")).toBe("file");
    expect(migrationRouteForJoinFrom("okke")).toBe("file");
    expect(migrationRouteForJoinFrom("hnry")).toBe("file");
  });

  it("falls back to 'file' for an id it doesn't recognise", () => {
    expect(migrationRouteForJoinFrom("something-new")).toBe("file");
  });

  it("has a route for every id in JOIN_FROM_OPTIONS", () => {
    for (const option of JOIN_FROM_OPTIONS) {
      expect(() => migrationRouteForJoinFrom(option.id)).not.toThrow();
    }
  });

  it("accepts the stored label as well as the id", () => {
    expect(migrationRouteForJoinFrom("Xero")).toBe("direct");
    expect(migrationRouteForJoinFrom("First time user")).toBe("none");
    expect(migrationRouteForJoinFrom("Spreadsheets")).toBe("spreadsheet");
  });
});

describe("findJoinFromOption", () => {
  it("finds an option by id or by label, ignoring case", () => {
    expect(findJoinFromOption("xero")?.label).toBe("Xero");
    expect(findJoinFromOption("QuickBooks")?.id).toBe("quickbooks");
    expect(findJoinFromOption("  first time USER ")?.id).toBe(
      "first-time-user",
    );
  });

  it("returns undefined for an unknown or blank answer", () => {
    expect(findJoinFromOption("something-new")).toBeUndefined();
    expect(findJoinFromOption("")).toBeUndefined();
  });
});

describe("joinFromNeedsMigration", () => {
  it("is false only for a first-time user or no answer", () => {
    expect(joinFromNeedsMigration("First time user")).toBe(false);
    expect(joinFromNeedsMigration(null)).toBe(false);
    expect(joinFromNeedsMigration("")).toBe(false);
  });

  it("is true for every platform and for spreadsheets", () => {
    for (const option of JOIN_FROM_OPTIONS) {
      if (option.id === "first-time-user") continue;
      expect(joinFromNeedsMigration(option.label)).toBe(true);
    }
  });
});
