import { describe, expect, it } from "vitest";

import { INDUSTRY_CATALOG, INDUSTRY_IDS, resolveIndustrySlug } from "@/lib/demo-seed/industries/catalog";
import { TEMPLATES } from "@/lib/demo-seed/industries";
import { POOLS } from "@/lib/demo-seed/industries/pools";

const unique = (values: string[]) => new Set(values).size === values.length;

describe("industry catalog", () => {
  it("has a template for every catalog slug and none extra", () => {
    const catalogSlugs = INDUSTRY_CATALOG.map((e) => e.slug).sort();
    const templateSlugs = Object.keys(TEMPLATES).sort();
    expect(templateSlugs).toEqual(catalogSlugs);
  });

  it("gives NDIS the id the app gates on, and every id is unique", () => {
    expect(INDUSTRY_IDS.ndis).toBe(9);
    const ids = Object.values(INDUSTRY_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves slugs, labels, picker names and categories", () => {
    expect(resolveIndustrySlug("plumbing")).toBe("plumbing");
    expect(resolveIndustrySlug("Air Conditioning and Refrigeration")).toBe("air-conditioning-refrigeration");
    expect(resolveIndustrySlug("Handyman & General Maintenance")).toBe("handyman");
    expect(resolveIndustrySlug("Trades and construction")).toBe("general-tradesperson");
    expect(resolveIndustrySlug("nonsense")).toBeNull();
    expect(resolveIndustrySlug("")).toBeNull();
  });

  it("covers the 19 trades shown on the industry picker", () => {
    const trades = INDUSTRY_CATALOG.filter((e) => e.category === "trades-and-construction");
    expect(trades).toHaveLength(19);
  });
});

describe("client pools", () => {
  for (const [key, pool] of Object.entries(POOLS)) {
    it(`${key} has 16 unique clients of at least two kinds`, () => {
      expect(pool).toHaveLength(16);
      expect(unique(pool.map((c) => c.name))).toBe(true);
      expect(new Set(pool.map((c) => c.kind)).size).toBeGreaterThanOrEqual(2);
      for (const c of pool) {
        expect(c.name.trim()).not.toBe("");
        expect(c.contact.trim()).not.toBe("");
      }
    });
  }
});

describe("industry templates", () => {
  for (const entry of INDUSTRY_CATALOG) {
    const t = TEMPLATES[entry.slug];
    if (!t) continue;

    describe(entry.slug, () => {
      it("has a valid price list", () => {
        expect(t.services.length).toBeGreaterThanOrEqual(8);
        expect(t.services.length).toBeLessThanOrEqual(12);
        expect(unique(t.services.map((s) => s.name))).toBe(true);
        for (const s of t.services) expect(s.price).toBeGreaterThan(0);
        expect(t.services.some((s) => (s.unit ?? "items") === "items")).toBe(true);
      });

      it("only has stock when the industry uses the inventory module", () => {
        if (entry.modules.includes("inventory")) {
          expect(t.products.length).toBeGreaterThanOrEqual(5);
          expect(t.products.length).toBeLessThanOrEqual(8);
          expect(t.products.some((p) => p.qty < p.low)).toBe(true);
        } else if (entry.slug !== "electrical") {
          expect(t.products).toHaveLength(0);
        }
        expect(unique(t.products.map((p) => p.sku))).toBe(true);
        for (const p of t.products) {
          expect(p.price).toBeGreaterThan(p.cost);
          expect(p.cost).toBeGreaterThan(0);
          expect(p.qty).toBeGreaterThan(0);
          expect(p.low).toBeGreaterThan(0);
        }
      });

      it("has suppliers, assets and staff", () => {
        expect(t.suppliers.length).toBeGreaterThanOrEqual(3);
        expect(t.suppliers.length).toBeLessThanOrEqual(5);
        for (const s of t.suppliers) {
          expect(s.typical[0]).toBeGreaterThan(0);
          expect(s.typical[0]).toBeLessThanOrEqual(s.typical[1]);
          expect(s.items.length).toBeGreaterThanOrEqual(1);
          expect(s.category.length).toBeGreaterThanOrEqual(1);
        }
        expect(t.assets.length).toBeGreaterThanOrEqual(3);
        expect(t.assets.length).toBeLessThanOrEqual(4);
        for (const a of t.assets) {
          expect(a.price).toBeGreaterThan(0);
          expect(a.life).toBeGreaterThan(0);
        }
        expect(t.employees).toHaveLength(2);
      });

      it("has job wording with four projects and four stages", () => {
        expect(t.job.noun).toBe(t.job.noun.toLowerCase());
        expect(t.job.projects).toHaveLength(4);
        for (const p of t.job.projects) expect(p).toContain("{client}");
        expect(t.job.stages).toHaveLength(4);
        expect(t.job.bookingTitle.length).toBeGreaterThan(3);
      });

      it("points at a client pool that exists", () => {
        expect(POOLS[t.clientPool]).toBeDefined();
      });
    });
  }
});
