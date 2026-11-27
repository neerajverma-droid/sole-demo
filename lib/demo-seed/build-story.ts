/**
 * Builds the Story (the one demo business) for an industry and a country from a
 * small industry template. AU electrical is the hand-built default and is
 * returned as-is; everything else is derived here.
 */

import { getCountryConfig, demoPhone, placeFor } from "./country";
import {
  CATEGORY_LABELS,
  DEFAULT_INDUSTRY_SLUG,
  getCatalogEntry,
  industryIdFor,
  resolveIndustrySlug,
} from "./industries/catalog";
import { getTemplate } from "./industries";
import { POOLS } from "./industries/pools";
import type { DemoCountry, DemoModule, IndustryTemplate } from "./industries/types";
import {
  MAIL,
  defaultStory,
  type DemoClient,
  type DemoInventoryProduct,
  type DemoProject,
  type DemoService,
  type DemoSupplier,
  type Story,
} from "./story";
import { hashString } from "./util";

const ALL_MODULES: DemoModule[] = ["calendar", "projects", "km", "payroll", "hr", "proposals", "assets", "budget", "inventory"];

const OWNERS: [string, string][] = [
  ["Sam", "Taylor"],
  ["Alex", "Morgan"],
  ["Jordan", "Reid"],
  ["Casey", "Nguyen"],
  ["Riley", "Patel"],
  ["Morgan", "Walker"],
];

// None of these may match the default story's staff (Jake Morrison, Olivia Grant):
// localize.ts re-skins the default's hand-written responses by name.
const STAFF_NAMES: [string, string][] = [
  ["Lachlan", "Brown"],
  ["Priya", "Sharma"],
  ["Mia", "Roberts"],
  ["Liam", "Hughes"],
  ["Chloe", "Davies"],
  ["Noah", "Kelly"],
  ["Zoe", "Mitchell"],
  ["Ethan", "Wright"],
];

const NAME_PREFIX: Record<DemoCountry, string[]> = {
  AU: ["Coastal", "Southern Cross", "Red Gum", "Harbourside", "Ironbark", "Bluegum"],
  NZ: ["Kiwi", "Kauri", "Tui", "Southern Alps", "Manuka", "Harbour"],
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 28);

const emailLocal = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");

/** Chart-of-accounts expense subcategory ids the generator's COA defines. */
function subcategoryFor(category: string[]): number {
  const c = category.join(" ").toLowerCase();
  if (/fuel|petrol|diesel/.test(c)) return 143;
  if (/telephone|internet|phone/.test(c)) return 144;
  if (/insurance/.test(c)) return 145;
  if (/hire|plant|equipment/.test(c)) return 146;
  if (/office|stationery|software|subscription/.test(c)) return 147;
  if (/uniform|clothing|workwear|ppe/.test(c)) return 148;
  if (/tool|consumable/.test(c)) return 142;
  if (/material|goods|stock|packaging|ingredient|supplies|freight|subcontract|cost incurred/.test(c)) return 141;
  return 149;
}

const stripSuffix = (name: string) => name.replace(/\s+(Residence|Family)$/i, "");

function roundTo(n: number, step: number) {
  return Math.max(step, Math.round(n / step) * step);
}

export function buildStory(slugInput: string | null | undefined, country: DemoCountry): Story {
  const slug = resolveIndustrySlug(slugInput) ?? DEFAULT_INDUSTRY_SLUG;
  if (slug === DEFAULT_INDUSTRY_SLUG && country === "AU") return defaultStory;

  const template: IndustryTemplate = getTemplate(slug) ?? getTemplate("general-business") ?? getTemplate(DEFAULT_INDUSTRY_SLUG)!;
  const entry = getCatalogEntry(template.slug)!;
  const cfg = getCountryConfig(country);
  const h = hashString(`${template.slug}:${country}`);
  const place = placeFor(country, template.slug);

  /* Business ------------------------------------------------------------ */
  const name =
    template.businessNames?.[country] ?? `${NAME_PREFIX[country][h % NAME_PREFIX[country].length]} ${template.short}`;
  const [ownerFirst, ownerLast] = OWNERS[h % OWNERS.length];
  const key = slugify(name);
  const email = MAIL(`accounts.${key}`);

  const business = {
    id: 1,
    name,
    owner: { first_name: ownerFirst, last_name: ownerLast },
    email,
    phone: demoPhone(country, h),
    abn: cfg.businessId,
    address: {
      line1: place.street,
      city: place.city,
      state: place.region,
      postcode: place.postcode,
      country: cfg.name,
    },
    website: `https://${key}.example.com`,
    industry: entry.label,
    industry_id: industryIdFor(template.slug),
    accounting_type: "cash",
    tax_registered: 1,
    bank_name: cfg.bankName,
    bsb: cfg.bank.bsb ?? "",
    account_number: cfg.bank.accountNumber,
    account_holder: name,
    currency: cfg.currency,
    currency_symbol: cfg.currencySymbol,
    timezone: cfg.timezone,
    tax_id: cfg.taxId,
  };

  /* Clients ------------------------------------------------------------- */
  const pool = POOLS[template.clientPool];
  const clients: DemoClient[] = pool.map((c, i) => {
    // Most clients are local; every fifth is in another town so reports have some spread.
    const clientPlace = i % 5 === 4 ? cfg.places[(h + i) % cfg.places.length] : place;
    return {
      id: String(100 + i),
      name: c.name,
      contact: c.contact,
      kind: c.kind,
      email: MAIL(emailLocal(c.contact)),
      city: clientPlace.city,
      country: cfg.name,
      contactId: String(200 + i),
    };
  });

  /* Price list ---------------------------------------------------------- */
  const services: DemoService[] = template.services.map((s, i) => ({
    id: String(300 + i),
    name: s.name,
    price: s.price,
    unit: s.unit ?? "items",
    kinds: s.kinds ?? ["residential", "commercial", "strata"],
  }));

  const inventory: DemoInventoryProduct[] = template.products.map((p, i) => ({
    id: String(350 + i),
    name: p.name,
    sku: p.sku,
    cost_price: p.cost,
    selling_price: p.price,
    unit: "items",
    inventory_count: p.qty,
    low_stock_threshold: p.low,
    tracked: true,
    purchase_description: `${p.name} — trade supply`,
    sale_description: p.name,
  }));

  /* Suppliers: industry-specific, then the shared four ------------------- */
  const specific = template.suppliers.map((s) => ({
    name: s.name,
    contact: s.contact ?? "Accounts",
    category: s.category,
    subcategoryId: subcategoryFor(s.category),
    typical: s.typical,
    items: s.items,
  }));
  const shared = [
    ...(template.vehicle
      ? [{ name: cfg.shared.fuel, contact: "Accounts", category: ["motor vehicle expenses", "fuel"], subcategoryId: 143, typical: [70, 140] as [number, number], items: ["Fuel — work vehicle"] }]
      : []),
    { name: cfg.shared.telco, contact: "Billing", category: ["telephone", "internet"], subcategoryId: 144, typical: [89, 89] as [number, number], items: ["Mobile and internet plan"] },
    { name: cfg.shared.insurance, contact: "Policy Team", category: ["insurance"], subcategoryId: 145, typical: [245, 245] as [number, number], items: ["Public liability insurance (monthly)"] },
    { name: cfg.shared.office, contact: "Store", category: ["office expenses"], subcategoryId: 147, typical: [15, 120] as [number, number], items: ["Printer ink and paper", "Stationery"] },
  ];
  const suppliers: DemoSupplier[] = [...specific, ...shared].map((s, i) => ({
    ...s,
    id: String(500 + i),
    contactId: String(600 + i),
    email: MAIL(`accounts.${s.name.toLowerCase().replace(/[^a-z]+/g, "")}`),
  }));

  /* Projects ------------------------------------------------------------ */
  const prices = template.services.map((s) => s.price).sort((a, b) => a - b);
  const typicalPrice = prices[Math.floor(prices.length / 2)] ?? 100;
  const picks = [0, 1, 6, 3].map((i) => i % clients.length);
  const statuses: DemoProject["status"][] = ["inprogress", "inprogress", "completed", "draft"];
  const monthSpans: [number, number][] = [[-4, 1], [-2, 1], [-5, -3], [0, 2]];
  const jobCounts = [3, 2, 2, 2];
  const budgetFactor = [16, 10, 7, 9];
  const projects: DemoProject[] = picks.map((ci, i) => {
    const client = clients[ci];
    const pid = i + 1;
    return {
      id: String(pid),
      name: template.job.projects[i].replace("{client}", stripSuffix(client.name)),
      client: client.name,
      clientId: client.id,
      contactId: client.contactId,
      code: `PRO-${pid}`,
      budget: roundTo(typicalPrice * budgetFactor[i], 100),
      months: monthSpans[i],
      status: statuses[i],
      jobs: template.job.stages.slice(0, jobCounts[i]).map((stage, j) => ({
        id: String(pid * 100 + j + 1),
        name: stage,
        code: `PRO-${pid}-J${j + 1}`,
      })),
    };
  });

  /* Vehicle, assets, staff ---------------------------------------------- */
  const v = template.vehicle;
  const vehicle = v
    ? {
        nickname: v.nickname,
        make: v.make,
        model: v.model,
        year: v.year,
        registration_number: `${String(100 + (h % 899))}-${String.fromCharCode(65 + (h % 26))}${String.fromCharCode(65 + ((h >> 3) % 26))}${String.fromCharCode(65 + ((h >> 6) % 26))}`,
        fuel_type: v.fuel,
        engine_capacity: v.fuel === "Electric" ? "—" : "2.8L",
        logbook_start_odometer: "38200",
      }
    : null;

  const assetRows = [
    ...(v
      ? [
          {
            id: "1",
            name: `${v.make} ${v.model} (${v.nickname.toLowerCase()})`,
            category: "Vehicle",
            brand: v.make,
            type: v.nickname,
            price: 54990,
            monthsAgo: 14,
            life: 8,
            method: "diminishing_value",
            supplier: null as string | null,
            serial: `VIN${100000 + (h % 899999)}`,
          },
        ]
      : []),
    ...template.assets.slice(0, v ? 3 : 4).map((a, i) => ({
      id: String((v ? 2 : 1) + i),
      name: a.name,
      category: a.category,
      brand: a.brand,
      type: a.type,
      price: a.price,
      monthsAgo: a.monthsAgo,
      life: a.life,
      method: a.method ?? "straight_line",
      supplier: a.supplier ?? null,
      serial: `${a.brand.slice(0, 3).toUpperCase()}-${100000 + ((h + i * 7919) % 899999)}`,
    })),
  ];

  const employees = template.employees.map((e, i) => {
    const [first, last] = STAFF_NAMES[(h + i * 3) % STAFF_NAMES.length];
    return {
      id: String(i + 1),
      first_name: first,
      last_name: last,
      role: e.role,
      hourly: e.hourly,
      hours: e.hours,
      email: MAIL(`${first}.${last}`.toLowerCase()),
    };
  });

  return {
    slug: template.slug,
    label: entry.label,
    short: template.short,
    categoryLabel: CATEGORY_LABELS[entry.category],
    country,
    // The demo opens every plan module for every industry, so a prospect can visit them all;
    // `entry.modules` (the plan's recommendation) stays in the catalog for reference.
    modules: ALL_MODULES,
    seed: (h ^ 20261029) >>> 0,
    legacyNarrative: false,
    business,
    clients,
    suppliers,
    services,
    inventory,
    projects,
    vehicle,
    assets: assetRows,
    employees,
    job: {
      noun: template.job.noun,
      bookingTitle: template.job.bookingTitle,
      bookingBlurb: template.job.bookingBlurb,
    },
    incomeCategory: `${template.short} services`,
  };
}
