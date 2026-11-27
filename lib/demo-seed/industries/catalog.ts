/**
 * The industry catalog: slug → category, recommended modules and plan tier.
 *
 * Slugs, tiers and modules are copied from sole-webapp `lib/industry-packages.ts`
 * (the product team's mapping), so `?industry=plumbing` means the same thing here
 * as on the marketing site. Categories are the 12 groups on the industry picker
 * plus "everything else".
 */

import type {
  DemoModule as M,
  IndustryCatalogEntry,
  IndustryCategory,
} from "./types";

type Row = Omit<IndustryCatalogEntry, "slug">;
const row = (
  category: IndustryCategory,
  tier: Row["tier"],
  modules: M[],
  label: string,
  aliases?: string[],
): Row => ({ category, tier, modules, label, aliases });

const T = "trades-and-construction" as const;
const H = "home-and-outdoor-services" as const;
const F = "fitness-hair-and-beauty" as const;
const S = "health-and-social-care" as const;
const P = "professional-services" as const;
const C = "creative-and-media" as const;
const R = "retail-ecommerce-and-making" as const;
const PR = "property-and-real-estate" as const;
const TR = "transport-and-automotive" as const;
const E = "education-and-tutoring" as const;
const HO = "hospitality-and-food" as const;
const FA = "farming-and-growing" as const;
const X = "everything-else" as const;

const ROWS: Record<string, Row> = {
  // Trades and construction
  construction: row(T, "pro", ["projects", "calendar", "proposals", "payroll", "assets"], "Construction"),
  plumbing: row(T, "advanced", ["projects", "calendar", "km", "proposals", "payroll"], "Plumbing"),
  electrical: row(T, "advanced", ["projects", "calendar", "km", "proposals", "assets"], "Electrical"),
  "carpentry-joinery": row(T, "advanced", ["projects", "calendar", "proposals", "assets", "payroll"], "Carpentry and Joinery"),
  "painting-decorating": row(T, "advanced", ["projects", "calendar", "proposals", "budget"], "Painting and Decorating"),
  "tiling-flooring": row(T, "advanced", ["projects", "calendar", "proposals", "budget"], "Tiling and Flooring"),
  plastering: row(T, "compliance_plus_one", ["projects", "calendar", "proposals"], "Plastering"),
  "roofing-guttering": row(T, "advanced", ["projects", "calendar", "km", "proposals", "payroll"], "Roofing and Guttering"),
  "air-conditioning-refrigeration": row(T, "advanced", ["projects", "calendar", "km", "assets", "payroll"], "Air Conditioning and Refrigeration"),
  "metal-fabrication-welding": row(T, "pro", ["projects", "assets", "inventory", "payroll", "proposals"], "Metal Fabrication and Welding"),
  "concrete-paving": row(T, "advanced", ["projects", "calendar", "proposals", "assets", "payroll"], "Concrete and Paving"),
  "excavation-earthmoving": row(T, "pro", ["projects", "assets", "km", "payroll", "proposals"], "Excavation and Earthmoving"),
  "glazing-windows": row(T, "advanced", ["projects", "calendar", "proposals", "payroll", "assets"], "Glazing and Windows"),
  "locksmithing-security": row(T, "advanced", ["projects", "calendar", "proposals", "inventory", "payroll"], "Locksmithing and Security Systems"),
  "cabinet-making-shopfitting": row(T, "pro", ["projects", "inventory", "assets", "proposals", "payroll"], "Cabinet Making and Shopfitting"),
  waterproofing: row(T, "compliance_plus_one", ["projects", "calendar", "proposals"], "Waterproofing"),
  "gas-fitting": row(T, "advanced", ["projects", "calendar", "km", "proposals", "payroll"], "Gas Fitting"),
  handyman: row(T, "advanced", ["projects", "calendar", "km", "proposals"], "Handyman and General Maintenance", ["handyman-general-maintenance"]),
  "general-tradesperson": row(T, "advanced", ["projects", "calendar", "km", "proposals", "payroll"], "General Tradesperson", ["trades"]),

  // Home and outdoor services
  cleaning: row(H, "advanced", ["calendar", "km", "payroll", "hr"], "Cleaning Services"),
  gardening: row(H, "advanced", ["calendar", "km", "projects", "proposals"], "Gardening"),
  "landscaping-fencing": row(H, "pro", ["projects", "calendar", "km", "payroll", "proposals"], "Landscaping and Fencing"),
  "pest-control": row(H, "advanced", ["calendar", "km", "proposals", "payroll", "assets"], "Pest Control"),

  // Fitness, hair and beauty
  "personal-trainer": row(F, "compliance", ["calendar", "projects"], "Personal Trainer", ["personal-trainers", "fitness"]),
  hairdressers: row(F, "compliance_plus_one", ["calendar", "budget", "inventory"], "Hairdressers", ["hairdresser"]),
  "hair-beauty": row(F, "advanced", ["calendar", "inventory", "payroll", "hr"], "Hair and Beauty", ["make-up", "beauty"]),

  // Health and social care
  ndis: row(S, "pro", ["calendar", "projects", "km", "payroll", "hr"], "NDIS (Health and Social Care)", ["health-and-social-care", "health-social-care"]),

  // Professional services
  "contractors-professional-services": row(P, "compliance_plus_one", ["projects", "proposals", "calendar"], "Contractors and Professional Services", ["professional-services"]),
  "admin-services": row(P, "compliance_plus_one", ["projects", "calendar", "proposals"], "Admin Services"),
  consulting: row(P, "compliance_plus_one", ["projects", "proposals", "calendar"], "Consulting"),
  finance: row(P, "compliance_plus_one", ["calendar", "proposals", "projects"], "Finance"),

  // Creative and media
  creatives: row(C, "compliance_plus_one", ["projects", "calendar", "proposals"], "Creatives"),
  arts: row(C, "compliance_plus_one", ["projects", "calendar", "proposals"], "Arts"),
  media: row(C, "compliance_plus_one", ["projects", "calendar", "proposals"], "Media"),
  "photographers-videographers": row(C, "advanced", ["projects", "calendar", "proposals", "assets"], "Photographers and Videographers"),
  influencers: row(C, "advanced", ["projects", "calendar", "proposals", "budget"], "Influencers"),

  // Retail, eCommerce and making
  retail: row(R, "compliance_plus_one", ["inventory", "budget", "calendar"], "Retail"),
  ecommerce: row(R, "advanced", ["inventory", "budget", "projects", "proposals"], "eCommerce", ["e-commerce"]),
  wholesaler: row(R, "advanced", ["inventory", "budget", "proposals", "payroll"], "Wholesaler"),
  manufacturers: row(R, "pro", ["inventory", "assets", "projects", "budget", "payroll"], "Manufacturers"),

  // Property and real estate
  "property-management": row(PR, "pro", ["calendar", "projects", "proposals", "payroll", "budget"], "Property Management"),
  "real-estate": row(PR, "compliance_plus_one", ["calendar", "proposals", "km"], "Real Estate"),
  "investment-property": row(PR, "pro", ["calendar", "projects", "proposals", "budget", "payroll"], "Investment Property Management"),

  // Transport and automotive
  "transport-delivery": row(TR, "pro", ["km", "calendar", "assets", "payroll", "hr"], "Transport, Delivery and People Movers"),
  "transport-owner-driver": row(TR, "advanced", ["km", "assets", "calendar", "budget"], "Transport (Owner-Driver / Courier)"),
  "automotive-mechanics": row(TR, "advanced", ["assets", "inventory", "calendar", "proposals", "payroll"], "Automotive and Mobile Mechanics"),

  // Education and tutoring
  "education-tutoring": row(E, "compliance_plus_one", ["calendar", "projects", "proposals"], "Education and Tutoring"),

  // Hospitality and food
  hospitality: row(HO, "pro", ["payroll", "hr", "inventory", "calendar", "budget"], "Hospitality and Food"),

  // Farming and growing
  agriculture: row(FA, "pro", ["assets", "payroll", "hr", "km", "budget"], "Agriculture"),

  // Everything else
  "general-business": row(X, "compliance", ["calendar", "projects"], "General Business"),
};

export const INDUSTRY_CATALOG: IndustryCatalogEntry[] = Object.entries(ROWS).map(
  ([slug, r]) => ({ slug, ...r }),
);

export const CATEGORY_LABELS: Record<IndustryCategory, string> = {
  "trades-and-construction": "Trades and construction",
  "home-and-outdoor-services": "Home and outdoor services",
  "fitness-hair-and-beauty": "Fitness, hair and beauty",
  "health-and-social-care": "Health and social care",
  "professional-services": "Professional services",
  "creative-and-media": "Creative and media",
  "retail-ecommerce-and-making": "Retail, eCommerce and making",
  "property-and-real-estate": "Property and real estate",
  "transport-and-automotive": "Transport and automotive",
  "education-and-tutoring": "Education and tutoring",
  "hospitality-and-food": "Hospitality and food",
  "farming-and-growing": "Farming and growing",
  "everything-else": "Everything else",
};

/** What `?industry=<category>` falls back to: the broadest industry in the group. */
const CATEGORY_DEFAULT: Record<IndustryCategory, string> = {
  "trades-and-construction": "general-tradesperson",
  "home-and-outdoor-services": "cleaning",
  "fitness-hair-and-beauty": "hair-beauty",
  "health-and-social-care": "ndis",
  "professional-services": "contractors-professional-services",
  "creative-and-media": "creatives",
  "retail-ecommerce-and-making": "retail",
  "property-and-real-estate": "property-management",
  "transport-and-automotive": "transport-delivery",
  "education-and-tutoring": "education-tutoring",
  "hospitality-and-food": "hospitality",
  "farming-and-growing": "agriculture",
  "everything-else": "general-business",
};

/** Case, punctuation and "&" vs "and" don't make two industries. */
export function normaliseSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

const LOOKUP = new Map<string, string>();
for (const entry of INDUSTRY_CATALOG) {
  for (const name of [entry.slug, entry.label, ...(entry.aliases ?? [])]) {
    LOOKUP.set(normaliseSlug(name), entry.slug);
  }
}
for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
  LOOKUP.set(normaliseSlug(category), CATEGORY_DEFAULT[category as IndustryCategory]);
  LOOKUP.set(normaliseSlug(label), CATEGORY_DEFAULT[category as IndustryCategory]);
}

/** A slug, label, alias or category name → a catalog slug, or null if unknown. */
export function resolveIndustrySlug(value: string | null | undefined): string | null {
  if (!value) return null;
  return LOOKUP.get(normaliseSlug(value)) ?? null;
}

export function getCatalogEntry(slug: string): IndustryCatalogEntry | undefined {
  return INDUSTRY_CATALOG.find((entry) => entry.slug === slug);
}

export const DEFAULT_INDUSTRY_SLUG = "electrical";

/**
 * The `industry_id` each slug is served under by the demo's `GET /industry`.
 * "Health and Social Care" must be id 9: the app relabels that id to its NDIS
 * name and gates every NDIS field on it (see lib/industries.ts). Everything else
 * is numbered in catalog order, skipping 9.
 */
const NDIS_ID = 9;
export const INDUSTRY_IDS: Record<string, number> = (() => {
  const ids: Record<string, number> = {};
  let next = 1;
  for (const entry of INDUSTRY_CATALOG) {
    if (entry.slug === "ndis") {
      ids[entry.slug] = NDIS_ID;
      continue;
    }
    if (next === NDIS_ID) next++;
    ids[entry.slug] = next++;
  }
  return ids;
})();

export function industryIdFor(slug: string): number {
  return INDUSTRY_IDS[slug] ?? INDUSTRY_IDS[DEFAULT_INDUSTRY_SLUG];
}
