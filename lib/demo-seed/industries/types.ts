/**
 * Shapes for the industry demo templates.
 *
 * One template per industry holds only what is genuinely industry-specific
 * (services, stock, suppliers, assets, staff roles, who the clients are).
 * Everything else a demo needs — projects, calendar jobs, bills, budgets,
 * notifications — is derived from these by `buildStory`, so adding or editing
 * an industry means editing ONE small data file.
 */

export type DemoCountry = "AU" | "NZ";

/** Mirrors the three client shapes the generator already understands. */
export type ClientKind = "commercial" | "strata" | "residential";

export type DemoModule =
  | "calendar"
  | "projects"
  | "km"
  | "payroll"
  | "hr"
  | "proposals"
  | "assets"
  | "budget"
  | "inventory";

export type IndustryCategory =
  | "trades-and-construction"
  | "home-and-outdoor-services"
  | "fitness-hair-and-beauty"
  | "health-and-social-care"
  | "professional-services"
  | "creative-and-media"
  | "retail-ecommerce-and-making"
  | "property-and-real-estate"
  | "transport-and-automotive"
  | "education-and-tutoring"
  | "hospitality-and-food"
  | "farming-and-growing"
  | "everything-else";

/** A named bundle of 16 plausible clients; templates point at one by key. */
export type ClientPoolKey =
  | "households-and-businesses" // trades: homeowners, shops, body corporates
  | "individual-consumers" // fitness, hair & beauty, tutoring: mostly people
  | "small-businesses" // B2B services: consulting, admin, finance, wholesale
  | "care-participants" // NDIS / health: participants, plan managers, families
  | "property-owners" // landlords, owners corporations, investors
  | "creative-clients" // brands, agencies, couples, publishers
  | "retail-customers" // shoppers, stallholders, online buyers
  | "hospitality-customers" // events, offices, venues, private catering
  | "farm-customers" // growers, co-ops, packhouses, stock agents
  | "freight-customers"; // dispatchers, wholesalers, courier platforms

export interface PoolClient {
  name: string;
  contact: string;
  kind: ClientKind;
}

export interface TemplateService {
  name: string;
  price: number;
  unit?: "items" | "hours" | "days";
  /** Which client kinds are billed this service. Default: all. */
  kinds?: ClientKind[];
}

export interface TemplateProduct {
  name: string;
  sku: string;
  cost: number;
  price: number;
  /** Units on hand. */
  qty: number;
  /** Reorder point; make 1–2 products sit under it. */
  low: number;
}

export interface TemplateSupplier {
  name: string;
  contact?: string;
  /** Expense categories, most specific first. */
  category: string[];
  /** [min, max] per bill; equal values mean a fixed monthly charge. */
  typical: [number, number];
  /** What a bill from this supplier is for (picked at random). */
  items: string[];
}

export interface TemplateAsset {
  name: string;
  category: "Vehicle" | "Tools" | "Equipment" | "Technology" | "Furniture" | "Plant";
  brand: string;
  type: string;
  price: number;
  monthsAgo: number;
  /** Useful life, years. */
  life: number;
  method?: "straight_line" | "diminishing_value";
  /** Name of one of this template's (or the shared) suppliers. */
  supplier?: string | null;
}

export interface TemplateEmployee {
  role: string;
  hourly: number;
  hours: number;
}

export interface TemplateVehicle {
  nickname: string;
  make: string;
  model: string;
  year: string;
  fuel: "Petrol" | "Diesel" | "Electric" | "Hybrid";
}

export interface IndustryTemplate {
  /** Marketing slug, as in `?industry=`. Must exist in the catalog. */
  slug: string;
  /** Short trade word used in the business name, e.g. "Plumbing". */
  short: string;
  /** Overrides the generated business name for a country. */
  businessNames?: Partial<Record<DemoCountry, string>>;
  clientPool: ClientPoolKey;
  /** Price list: 8–12 services (the thing invoices and quotes are made of). */
  services: TemplateService[];
  /** Tracked stock: 0–8 products. An empty list means no inventory module. */
  products: TemplateProduct[];
  /** 3–5 industry-specific suppliers; shared telco/insurance/etc. are added for you. */
  suppliers: TemplateSupplier[];
  /** 3–4 depreciating assets (a vehicle goes in `vehicle`, not here). */
  assets: TemplateAsset[];
  /** Exactly 2 staff roles. */
  employees: [TemplateEmployee, TemplateEmployee];
  /** Null when the business has no work vehicle (km tracker still works). */
  vehicle: TemplateVehicle | null;
  job: {
    /** Singular noun for a booking/visit, lower case: "call-out", "session". */
    noun: string;
    /** Title of the public booking page: "Book a plumber". */
    bookingTitle: string;
    /** One-sentence booking page blurb (no prices — added for you). */
    bookingBlurb: string;
    /** Exactly 4 project names with a {client} placeholder: "{client} bathroom reno". */
    projects: [string, string, string, string];
    /** Exactly 4 job/stage names inside a project: "Rough-in". */
    stages: [string, string, string, string];
  };
}

/** Catalog row: ties a marketing slug to its category, plan and modules. */
export interface IndustryCatalogEntry {
  slug: string;
  label: string;
  category: IndustryCategory;
  modules: DemoModule[];
  tier: "compliance" | "compliance_plus_one" | "advanced" | "pro";
  /** Alternative names / image labels that should resolve to this slug. */
  aliases?: string[];
}
