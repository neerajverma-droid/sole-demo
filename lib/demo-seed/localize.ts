/**
 * Re-skins the mock's long tail of hand-written responses for another industry
 * and country.
 *
 * Many handlers (reports, time tracking, payroll, properties, reputation…)
 * were written once, for Coastal Spark Electrical in Australia. Rather than
 * fork each of them per industry, every response for a non-default story is
 * passed through here: the default story's people, suppliers, places and
 * wording are swapped, by position, for the active story's, and AU-only terms
 * (BAS, ABN, Superannuation) become the country's own.
 *
 * Plain string replacement on JSON-like data — it never touches numbers, keys
 * or structure, so a handler's shape can't be broken by it.
 */

import { getCountryConfig } from "./country";
import {
  business as legacyBusiness,
  clients as legacyClients,
  employees as legacyEmployees,
  type Story,
} from "./story";

type Pair = [string, string];

/** Electrical-specific job wording used in the hand-written handlers. */
const LEGACY_PHRASES = [
  "Switchboard Upgrade & Sub-main Cabling",
  "Switchboard rewiring, circuit isolation, and RCD testing",
  "Switchboard upgrade with 3-phase RCDs",
  "Downlight replacement & smoke alarm compliance certificate",
  "Smoke Alarm Interconnect & Compliance Audit",
  "Commercial Switchboard & Metering",
  "Commercial Switchboard Upgrade",
  "Main Switchboard Upgrade",
  "Switchboard Upgrade Wiring",
  "Smoke alarm compliance check",
  "Switchboard Commissioning",
  "switchboard commissioning",
  "Emergency Lighting Test",
  "Emergency Light Test",
  "Switchboard Upgrade",
  "Smoke Alarm Audit",
];

const cache = new WeakMap<Story, { regex: RegExp; map: Map<string, string> } | null>();

function build(story: Story) {
  const cfg = getCountryConfig(story.country);
  const biz = story.business;
  const pairs: Pair[] = [];
  // Anything the active story already uses must never be rewritten (a derived client
  // that happens to share a name with the default story's would otherwise be remapped).
  const inUse = new Set<string>([
    biz.name,
    biz.email,
    ...story.clients.flatMap((c) => [c.name, c.contact, c.email]),
    ...story.suppliers.map((s) => s.name),
    ...story.employees.flatMap((e) => [e.first_name, e.last_name, `${e.first_name} ${e.last_name}`]),
  ]);
  const add = (from: string, to: string) => {
    if (!from || !to || from === to || inUse.has(from)) return;
    // An alias that is only a piece of a name the story already uses ("Palm Grove" inside
    // "Palm Grove Body Corporate") must not be rewritten into a second copy of it.
    for (const used of inUse) if (used.length > from.length && used.includes(from)) return;
    pairs.push([from, to]);
  };

  const key = biz.email.split("@")[0].replace(/^accounts\./, "");
  const legacyKey = "coastalspark";

  // Business
  add(`${legacyBusiness.name} Pty Ltd`, story.country === "AU" ? `${biz.name} Pty Ltd` : `${biz.name} Limited`);
  add(legacyBusiness.name, biz.name);
  add("https://coastalspark.example.com", biz.website);
  add("https://g.page/r/coastal-spark/review", `https://g.page/r/${key}/review`);
  add("sam@coastalspark.com.au", `${biz.owner.first_name.toLowerCase()}@${key}.example.com`);
  add(`accounts.${legacyKey}@example.com`, biz.email);
  add(`@${legacyKey}.example.com`, `@${key}.example.com`);
  add(`spm_live_${legacyKey}_demo_key`, `spm_live_${key}_demo_key`);
  add(`${legacyBusiness.owner.first_name} ${legacyBusiness.owner.last_name}`, `${biz.owner.first_name} ${biz.owner.last_name}`);
  add(legacyBusiness.phone, biz.phone);
  add(legacyBusiness.phone.replace(/\s/g, ""), biz.phone.replace(/\s/g, ""));
  add(legacyBusiness.bank_name, biz.bank_name);
  add(legacyBusiness.abn, biz.abn);
  add("484-799", biz.bsb || "");
  add("10492831", biz.account_number);

  // Places
  add("Surfers Paradise", cfg.places[(cfg.places.findIndex((p) => p.city === biz.address.city) + 1) % cfg.places.length].city);
  for (const place of ["Gold Coast", "Southport", "Burleigh Waters", "Burleigh Heads", "Burleigh", "Broadbeach", "Tweed", "Currumbin", "Helensvale", "Varsity Lakes", "Robina", "Coomera", "Tallebudgera", "Bundall", "Main Beach"]) {
    add(place, biz.address.city);
  }
  add("14 Ferry Road", biz.address.line1);
  for (const code of ["4215", "4217", "4218"]) add(code, biz.address.postcode);
  add("QLD", biz.address.state);

  // Clients (names, contacts and emails by position)
  const clientAliases: Record<number, string[]> = {
    0: ["Harbour View Café", "Harbour View Cafe"],
    1: ["Palm Grove Body Corporate", "Palm Grove Strata", "Palm Grove CTS 4921", "Palm Grove"],
    3: ["Bayside Fitness Centre", "Bayside Fitness"],
  };
  legacyClients.forEach((legacy, i) => {
    const target = story.clients[i % story.clients.length];
    for (const alias of clientAliases[i] ?? [legacy.name]) add(alias, target.name);
    add(legacy.contact, target.contact);
    add(legacy.email, target.email);
  });

  // Suppliers
  const sup = (i: number) => story.suppliers[i % story.suppliers.length];
  const fuel = story.suppliers.find((s) => s.subcategoryId === 143) ?? sup(2);
  const telco = story.suppliers.find((s) => s.subcategoryId === 144) ?? sup(3);
  const insurance = story.suppliers.find((s) => s.subcategoryId === 145) ?? sup(4);
  add("Middy's Electrical - Burleigh", `${sup(0).name} - Trade Counter`);
  add("Middy's & Rexel", `${sup(0).name} & ${sup(1).name}`);
  add("Middy's/Rexel", `${sup(0).name}/${sup(1).name}`);
  add("Middendorp Electric Co Pty Ltd", `${sup(0).name} Ltd`);
  add("Rexel Electrical Supplies", sup(1).name);
  add("Rexel Australia", `${sup(1).name} Ltd`);
  add("Middy's Electrical Supplies", `${sup(0).name} Supplies`);
  add("Middy's Electrical", sup(0).name);
  add("Bunnings Trade - Burleigh Waters", `${sup(1).name} - Trade Counter`);
  add("Bunnings Warehouse", sup(1).name);
  add("Bunnings Group Ltd", `${sup(1).name} Ltd`);
  add("Ampol Southport", fuel.name);
  add("Telstra", telco.name);
  add("Tradie Insurance Co", insurance.name);
  add("Tradie Finance Australia", "Trade Finance Partners");
  add("Commercial Bank of Australia", biz.bank_name);
  add("Gold Coast Commercial Vans", sup(5).name);
  add("City of Gold Coast", `${biz.address.city} City Council`);
  add("Ray White", "Local Realty");
  add("Coastline Hire", sup(5).name);

  // Staff
  legacyEmployees.forEach((legacy, i) => {
    const target = story.employees[i % story.employees.length];
    add(`${legacy.first_name} ${legacy.last_name}`, `${target.first_name} ${target.last_name}`);
    add(`${legacy.first_name.toLowerCase()}.${legacy.last_name.toLowerCase()}`, `${target.first_name.toLowerCase()}.${target.last_name.toLowerCase()}`);
    add(`${legacy.first_name.toLowerCase()}_${legacy.last_name.toLowerCase()}`, `${target.first_name.toLowerCase()}_${target.last_name.toLowerCase()}`);
    add(legacy.role, target.role);
    add(legacy.first_name, target.first_name);
    add(legacy.last_name, target.last_name);
  });
  add("Sam and Jake did an outstanding job upgrading our commercial gym switchboard. Clean work, zero downtime!", `${biz.owner.first_name} and ${story.employees[0].first_name} did an outstanding job. Great communication and zero fuss!`);

  // Industry job wording → this industry's own services, by position
  const services = story.services;
  LEGACY_PHRASES.forEach((phrase, i) => add(phrase, services[(i * 3 + 1) % services.length].name));
  add("Electrical services", story.incomeCategory);
  add("HiLux", story.vehicle?.model ?? "vehicle");

  // Country wording
  if (story.country !== "AU") {
    add("Superannuation Guarantee Payable", `${cfg.retirementScheme} Payable`);
    add("Superannuation Expense - SG 11.5%", `${cfg.retirementScheme} employer contribution - 3%`);
    add("Superannuation Payable", `${cfg.retirementScheme} Payable`);
    add("Superannuation", cfg.retirementScheme);
    add("AustralianSuper", cfg.retirementFunds[0]);
    add("Hostplus", cfg.retirementFunds[1]);
    add("Australian Retirement Trust (ART)", cfg.retirementFunds[2]);
    add("BAS Extract Report", `${cfg.returnName} Extract Report`);
    add("BAS / GST Summary", `${cfg.returnName} Summary`);
    add("GST / BAS", `GST / ${cfg.returnName}`);
    add("BAS Excluded", "Outside the GST return");
    add("BAS", cfg.returnName);
    add("ABN", cfg.businessIdLabel);
    add("ATO", cfg.taxAuthorityLabel);
    add("AUSTRALIAN_RESIDENT", "NZ_RESIDENT");
    add("Australia/Brisbane", biz.timezone);
    add("Australia", cfg.name);
    add("Pty Ltd", "Limited");
  } else {
    add("Australia/Brisbane", biz.timezone);
  }

  // Longest first so "Palm Grove Body Corporate" wins over "Palm Grove"
  const map = new Map<string, string>();
  for (const [from, to] of pairs.sort((a, b) => b[0].length - a[0].length)) if (!map.has(from)) map.set(from, to);
  if (!map.size) return null;
  // Whole-word-ish: don't match inside a longer word (so "Sam" doesn't hit "Samantha"),
  // but a key that starts or ends with punctuation ("@acme.example.com") has no word edge to guard.
  const alnum = /[A-Za-z0-9]/;
  const escaped = [...map.keys()].map((k) => {
    const body = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `${alnum.test(k[0]) ? "(?<![A-Za-z0-9])" : ""}${body}${alnum.test(k[k.length - 1]) ? "(?![A-Za-z0-9])" : ""}`;
  });
  const regex = new RegExp(escaped.join("|"), "g");
  return { regex, map };
}

function table(story: Story) {
  if (!cache.has(story)) cache.set(story, build(story));
  return cache.get(story) ?? null;
}

function walk(value: unknown, t: { regex: RegExp; map: Map<string, string> }): unknown {
  if (typeof value === "string") {
    return value.replace(t.regex, (match) => t.map.get(match) ?? match);
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, t));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v, t);
    return out;
  }
  return value;
}

/** Swap the default story's names and wording for the active story's. No-op for the default story. */
export function localizeResponse<T>(data: T, story: Story): T {
  if (story.legacyNarrative) return data;
  const t = table(story);
  return t ? (walk(data, t) as T) : data;
}
