/**
 * Sole Perks — the partner deals from soleapp.com.au's own site.
 *
 * Not a sole-ocr endpoint. The deals are WordPress content, published and
 * curated on the marketing site, and read here straight from its public REST
 * API — the same thing sole-webapp's `SolePartners` component did with a bare
 * `axios.get`. It's a public, unauthenticated GET with an open CORS policy (it
 * reflects back whatever Origin asks), so there's nothing for sole-ocr to
 * proxy: calling it directly is both simpler and one less thing that can be
 * out of date behind a cache.
 */

const PERKS_API_URL =
  "https://soleapp.com.au/wp-json/wp/v2/partner?partner_category_slug=benefit-partner&per_page=100";

/**
 * The one taxonomy term every currently-featured partner carries. Checking
 * for "any term at all" rather than hardcoding this id would be sturdier
 * against the marketing team renaming it, but featured partners are the ones
 * promoted above the rest — getting that wrong by showing everyone as
 * featured, or no one, is the more visible failure, so this stays explicit.
 */
const FEATURED_TERM_ID = 401;

export type SolePerk = {
  id: number;
  name: string;
  logoUrl: string | null;
  /** Where "Get this deal" goes — the offer link, or the partner's own site. */
  url: string;
  description: string;
  discountCode: string;
  discountDescription: string;
  featured: boolean;
  /** The marketing team's own manual ordering, lower first. */
  order: number;
};

type ApiPartner = {
  id: number;
  title?: { rendered?: string };
  "featured-partner"?: number[];
  meta_box?: {
    partner_logo?: { full_url?: string; url?: string };
    partner_offer_url?: string;
    partner_website_url?: string;
    sole_app_description?: string;
    partner_short_description?: string;
    sole_app_discount_code?: string;
    sole_app_discount_code_description?: string;
    order?: string;
  };
};

function mapPartner(raw: ApiPartner): SolePerk {
  const meta = raw.meta_box ?? {};
  const name = raw.title?.rendered?.trim() || "Partner";

  return {
    id: raw.id,
    name,
    logoUrl: meta.partner_logo?.full_url ?? meta.partner_logo?.url ?? null,
    url:
      meta.partner_offer_url?.trim() || meta.partner_website_url?.trim() || "",
    description:
      meta.sole_app_description?.trim() ||
      meta.partner_short_description?.trim() ||
      "",
    discountCode: meta.sole_app_discount_code?.trim() ?? "",
    discountDescription: meta.sole_app_discount_code_description?.trim() ?? "",
    /*
     * AMEX carries the same featured term as the others on the live site but
     * isn't meant to be promoted alongside them — the one editorial exception
     * `SolePartners` carried over, kept here for the same reason: it's a
     * content decision made on the marketing site, not a bug to "fix" by
     * featuring it.
     */
    featured:
      (raw["featured-partner"]?.includes(FEATURED_TERM_ID) ?? false) &&
      name.toUpperCase() !== "AMEX",
    order: Number(meta.order) || 0,
  };
}

export async function fetchSolePerks(): Promise<SolePerk[]> {
  const response = await fetch(PERKS_API_URL, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Couldn't load Sole Perks right now.");
  }

  const raw = (await response.json()) as ApiPartner[];

  // Only entries with somewhere to send someone are worth a card — a deal
  // with neither an offer link nor a website is a dead end either way.
  return raw
    .filter(
      (partner) =>
        partner.meta_box?.partner_offer_url ||
        partner.meta_box?.partner_website_url,
    )
    .map(mapPartner)
    .sort((a, b) => a.order - b.order);
}
