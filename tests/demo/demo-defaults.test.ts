import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleMockRequest } from "@/lib/demo-seed/mock-server";
import { __resetSessionForTests, endDemoSession } from "@/lib/demo-seed/session";

/* eslint-disable @typescript-eslint/no-explicit-any */
const defaults = (params: Record<string, any> = {}) =>
  handleMockRequest("GET", "/client/v2", { "filter_by[scope]": "default", ...params })!;

beforeEach(() => {
  endDemoSession();
  __resetSessionForTests();
});
afterEach(() => {
  endDemoSession();
  __resetSessionForTests();
});

describe("default suppliers (Contacts → Default)", () => {
  it("Australia: the ~60 global brands, all suppliers, read-only rows", () => {
    handleMockRequest("POST", "/demo/login", {}, { industry: "plumbing", country: "AU" });
    const res = defaults({ limit: 100 });
    expect(res.data.pagination.total).toBeGreaterThanOrEqual(60);
    const names = res.data.data.map((r: any) => r.business_name);
    expect(names).toContain("Woolworths");
    expect(names).toContain("Bunnings");
    expect(names).toContain("ATO");
    expect(res.data.data.every((r: any) => r.type === "Supplier")).toBe(true);
    expect(res.data.data[0].notes).toContain("Default global supplier");
    // Real default rows carry no address.
    expect(res.data.data[0].city).toBeNull();
  });

  it("the count comes from pagination.total even when only one row is asked for", () => {
    handleMockRequest("POST", "/demo/login", {}, { industry: "hairdressers", country: "AU" });
    const one = defaults({ limit: 1 });
    expect(one.data.data).toHaveLength(1);
    expect(one.data.pagination.total).toBeGreaterThanOrEqual(60);
    const page2 = defaults({ limit: 25, page: 2 });
    expect(page2.data.data).toHaveLength(25);
    expect(page2.data.pagination.is_prev).toBe(true);
  });

  it("search narrows the list", () => {
    handleMockRequest("POST", "/demo/login", {}, { industry: "plumbing", country: "AU" });
    const res = defaults({ searchQuery: "bunnings" });
    expect(res.data.data.map((r: any) => r.business_name)).toEqual(["Bunnings"]);
  });

  it("New Zealand swaps Australia-only names for local ones", () => {
    handleMockRequest("POST", "/demo/login", {}, { industry: "plumbing", country: "NZ" });
    const names = defaults({ limit: 100 }).data.data.map((r: any) => r.business_name);
    expect(names).not.toContain("ATO");
    expect(names).not.toContain("Service NSW");
    expect(names).toContain("Inland Revenue");
    expect(names).toContain("Spark");
  });

  it("every industry sees them, with the fields the list reads", () => {
    for (const industry of ["ndis", "agriculture", "real-estate"]) {
      handleMockRequest("POST", "/demo/login", {}, { industry, country: "AU" });
      const row = defaults({ limit: 1 }).data.data[0];
      expect(row.business_name).toBeTruthy();
      // The fields the contacts list reads for a row.
      expect(row.email).toContain("@");
      expect(row.primary_contact.name).toBe("Customer Support");
    }
  });

  it("a default supplier opens as a read-only detail, and your own tab is untouched", () => {
    handleMockRequest("POST", "/demo/login", {}, { industry: "plumbing", country: "AU" });
    const first = defaults({ limit: 1 }).data.data[0];
    const detail = handleMockRequest("GET", `/client/${first.id}`)!;
    expect(detail.data.data.business_name).toBe(first.business_name);
    const own = handleMockRequest("GET", "/client/v2", { type: "2" })!;
    expect(own.data.pagination.total).toBeLessThan(20);
  });
});
