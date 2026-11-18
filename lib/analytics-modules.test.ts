import { afterEach, describe, expect, it, vi } from "vitest";

import { bulkModuleContext } from "@/lib/analytics-modules";
import { searchTargets } from "@/lib/nav";

afterEach(() => vi.unstubAllGlobals());

describe("bulk import module context", () => {
  it("names the module itself when opened from that module", () => {
    vi.stubGlobal("window", { location: { search: "" } });
    expect(bulkModuleContext("/invoices/bulk", "Invoices")).toEqual({
      module_name: "Invoices",
      sub_module_name: "Invoices",
    });
  });

  it("says Migrations when the Data Migration Center opened the importer page", () => {
    vi.stubGlobal("window", { location: { search: "?from=migrations" } });
    expect(bulkModuleContext("/invoices/bulk", "Invoices")).toEqual({
      module_name: "Migrations",
      sub_module_name: "Invoices",
    });
  });
});

describe("search targets for module_clicked", () => {
  const targets = searchTargets();

  it("marks a nested page as a sub-module of its group", () => {
    const quotes = targets.find((target) => target.label === "Quotes");
    expect(quotes).toEqual(expect.objectContaining({ kind: "sub_module" }));
    expect(quotes?.parent).toBeTruthy();
  });

  it("marks top-level rows as modules and leaves shortcuts unmarked", () => {
    expect(targets.find((target) => target.label === "Dashboard")?.kind).toBe("module");
    expect(targets.find((target) => target.label === "Create invoice")?.kind).toBeUndefined();
    expect(
      targets.find((target) => target.label === "View plans & subscription")?.kind,
    ).toBeUndefined();
  });
});
