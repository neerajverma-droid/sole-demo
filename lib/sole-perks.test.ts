import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { fetchSolePerks } from "@/lib/sole-perks";

/**
 * The join between this app and soleapp.com.au's own WordPress content —
 * verified against the live shape (36 real partner rows, pulled while
 * building this), not a shape invented from the old app's component.
 *
 * `partner_offer_url` is empty on about a fifth of real partners and
 * `sole_app_description` on about a sixth, which is exactly why both have a
 * fallback — the two cases worth pinning down are "no offer link at all" (the
 * partner is dropped, not shown with a dead button) and "offer link present,
 * description missing" (falls back to the short description rather than
 * showing a blank card).
 */

const AMEX = {
  id: 1,
  title: { rendered: "AMEX" },
  "featured-partner": [401],
  meta_box: {
    partner_offer_url: "https://amex.example/offer",
    partner_website_url: "https://amex.example",
    partner_logo: { full_url: "https://cdn.example/amex.png" },
    sole_app_description: "AMEX description",
    order: "1",
  },
};

const FEATURED = {
  id: 2,
  title: { rendered: "AUPOD" },
  "featured-partner": [401],
  meta_box: {
    partner_offer_url: "https://aupod.example/offer",
    partner_logo: { full_url: "https://cdn.example/aupod.png" },
    sole_app_description: "Podcasting for business owners.",
    sole_app_discount_code: "SOLE10",
    sole_app_discount_code_description: "10% off your first 3 months",
    order: "2",
  },
};

const NO_OFFER_FALLS_BACK_TO_WEBSITE = {
  id: 3,
  title: { rendered: "3D Measure Me" },
  "featured-partner": [],
  meta_box: {
    partner_offer_url: "",
    partner_website_url: "https://3dmeasureme.example",
    partner_short_description: "Short description, no sole_app one.",
    order: "3",
  },
};

const NO_LINK_AT_ALL = {
  id: 4,
  title: { rendered: "Nothing To Click" },
  "featured-partner": [],
  meta_box: { partner_offer_url: "", partner_website_url: "", order: "0" },
};

function mockFetch(partners: unknown[], ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(partners),
    }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSolePerks", () => {
  it("calls the public WordPress API with no auth headers", async () => {
    mockFetch([]);
    await fetchSolePerks();

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("soleapp.com.au/wp-json/wp/v2/partner");
    expect(url).toContain("partner_category_slug=benefit-partner");
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("drops a partner with neither an offer link nor a website", async () => {
    mockFetch([NO_LINK_AT_ALL, FEATURED]);

    const perks = await fetchSolePerks();

    expect(perks.map((p) => p.name)).toEqual(["AUPOD"]);
  });

  it("falls back to the website when there's no offer link", async () => {
    mockFetch([NO_OFFER_FALLS_BACK_TO_WEBSITE]);

    const [perk] = await fetchSolePerks();

    expect(perk.url).toBe("https://3dmeasureme.example");
  });

  it("falls back to the short description when sole_app_description is empty", async () => {
    mockFetch([NO_OFFER_FALLS_BACK_TO_WEBSITE]);

    const [perk] = await fetchSolePerks();

    expect(perk.description).toBe("Short description, no sole_app one.");
  });

  it("excludes AMEX from featured even though it carries the featured term", async () => {
    // The one editorial exception carried over from the old app's component —
    // real, live content, not a bug.
    mockFetch([AMEX]);

    const [perk] = await fetchSolePerks();

    expect(perk.featured).toBe(false);
  });

  it("features a partner that carries the term and isn't AMEX", async () => {
    mockFetch([FEATURED]);

    const [perk] = await fetchSolePerks();

    expect(perk.featured).toBe(true);
  });

  it("carries the discount code and description through when present", async () => {
    mockFetch([FEATURED]);

    const [perk] = await fetchSolePerks();

    expect(perk.discountCode).toBe("SOLE10");
    expect(perk.discountDescription).toBe("10% off your first 3 months");
  });

  it("sorts by the marketing team's own manual order", async () => {
    mockFetch([FEATURED, AMEX, NO_OFFER_FALLS_BACK_TO_WEBSITE]);

    const perks = await fetchSolePerks();

    expect(perks.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("throws when the request itself fails", async () => {
    mockFetch([], false);

    await expect(fetchSolePerks()).rejects.toThrow();
  });
});
