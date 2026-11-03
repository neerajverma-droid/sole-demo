/**
 * Where the money comes from, geographically.
 *
 * Driven from invoices rather than the contact list: a contact you've never
 * billed says nothing about where your business actually is, and a client you
 * bill monthly should count for what they're worth rather than for being one
 * row in a directory. So every invoice is walked, its client looked up, and the
 * totals summed per area.
 */

import { contactDisplayName, type Contact } from "@/lib/contacts";
import {
  invoiceAmount,
  invoiceOutstanding,
  type Invoice,
} from "@/lib/invoices";
import { quoteAmount, type Quote } from "@/lib/quotes";

/**
 * Where an invoiced client with no city on their record lands.
 *
 * They're kept rather than dropped — money you've billed is money you've
 * billed, and quietly excluding it would make the totals disagree with every
 * other card on the page. It also reads as the prompt it is: fill in the
 * address and this becomes a real area.
 */
export const UNSPECIFIED_AREA = "Unspecified location";

/**
 * How finely customers are grouped.
 *
 * Not every business covers a wide area: a sparky working three suburbs wants
 * suburbs, a wholesaler shipping nationally wants states, and a courier pricing
 * by delivery zone wants postcodes. One rule set, chosen by the person reading
 * it rather than assumed on their behalf.
 */
export const AREA_LEVELS = [
  { key: "suburb", label: "Suburb/City" },
  { key: "state", label: "State" },
  { key: "postcode", label: "Postcode" },
] as const;

export type AreaLevel = (typeof AREA_LEVELS)[number]["key"];

export const DEFAULT_AREA_LEVEL: AreaLevel = "suburb";

export function isAreaLevel(value: unknown): value is AreaLevel {
  return AREA_LEVELS.some((level) => level.key === value);
}

export function areaLevelLabel(level: AreaLevel): string {
  return AREA_LEVELS.find((entry) => entry.key === level)?.label ?? "Area";
}

export type CustomerArea = {
  key: string;
  label: string;
  amount: number;
  invoiceCount: number;
  /** Share of the invoiced total, for the ranked bar. */
  percent: number;
};

export type CustomerAreaSummary = {
  areas: CustomerArea[];
  /** Invoiced value behind the ranking, including areas past the cut. */
  total: number;
  /** How many areas didn't make the top N. */
  remaining: number;
};

/**
 * A draft isn't a client you've invoiced — it's one you're thinking about
 * invoicing — so it doesn't count towards where your customers are.
 */
function isBilled(invoice: Invoice): boolean {
  return invoice.status !== "Draft";
}

/**
 * A quote is open while it's with the client and undecided. Drafts aren't —
 * they've never left the desk — which mirrors how drafts are read everywhere
 * else here.
 */
function isOpenQuote(quote: Quote): boolean {
  return quote.status === "Sent";
}

/** Quoted work the client has actually seen, which is what conversion is off. */
function isQuoted(quote: Quote): boolean {
  return quote.status !== "Draft";
}

/**
 * Which area a contact counts towards, at the chosen level. One rule, used by
 * the ranking, the drill-in and the insights page alike, so an area's rows can
 * never disagree with its total.
 *
 * Overseas clients keep their country at every level: at suburb level it
 * disambiguates the city, and at state level a New Zealand client has no
 * Australian state but isn't missing an address either — "Unspecified" would be
 * a lie about a record that's complete.
 */
export function areaLabelFor(
  contact: Contact | undefined,
  level: AreaLevel = DEFAULT_AREA_LEVEL,
): string {
  const city = contact?.city.trim();
  if (!city) return UNSPECIFIED_AREA;

  const country = contact?.country.trim();
  const overseas = !!country && country.toLowerCase() !== "australia";

  if (level === "suburb") return overseas ? `${city}, ${country}` : city;
  if (overseas) return country;

  const key = city.toLowerCase();
  const grouped =
    level === "state" ? SAMPLE_STATES[key] : SAMPLE_POSTCODES[key];
  // A city the sample geocoder has never heard of has no state or postcode to
  // group under, which is the same kind of gap as a blank city.
  return grouped ?? UNSPECIFIED_AREA;
}

export function customerAreas(
  invoices: Invoice[],
  contacts: Contact[],
  {
    limit = 4,
    level = DEFAULT_AREA_LEVEL,
  }: { limit?: number; level?: AreaLevel } = {},
): CustomerAreaSummary {
  const contactsById = new Map(
    contacts.map((contact) => [contact.id, contact]),
  );
  const totals = new Map<string, { amount: number; invoiceCount: number }>();

  for (const invoice of invoices) {
    if (!isBilled(invoice)) continue;

    // A deleted contact leaves the invoice with a name and no record, which is
    // the same situation as a record with no city: unknown, not absent.
    const contact = invoice.clientId
      ? contactsById.get(invoice.clientId)
      : undefined;
    const label = areaLabelFor(contact, level);

    const running = totals.get(label) ?? { amount: 0, invoiceCount: 0 };
    running.amount += invoiceAmount(invoice);
    running.invoiceCount += 1;
    totals.set(label, running);
  }

  const total = [...totals.values()].reduce(
    (sum, entry) => sum + entry.amount,
    0,
  );

  const ranked = [...totals.entries()]
    .map(([label, entry]) => ({
      key: label,
      label,
      amount: entry.amount,
      invoiceCount: entry.invoiceCount,
      percent: total > 0 ? Math.round((entry.amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    areas: ranked.slice(0, limit),
    total,
    remaining: Math.max(0, ranked.length - limit),
  };
}

/**
 * Whether a document belongs to an area, by the client it's addressed to.
 *
 * The same rule the ranking is built on, handed to the lists so a link that
 * says "this area's invoices" lands on exactly the invoices that made up that
 * area's row. A null area filters nothing — the unfiltered list is the default,
 * not an empty one.
 */
export function areaPredicate(
  area: string | null,
  contacts: Contact[],
  level: AreaLevel = DEFAULT_AREA_LEVEL,
): (clientId: string | null) => boolean {
  if (!area) return () => true;
  const contactsById = new Map(
    contacts.map((contact) => [contact.id, contact]),
  );
  return (clientId) =>
    areaLabelFor(clientId ? contactsById.get(clientId) : undefined, level) ===
    area;
}

/* ------------------------------------------------------------------ *
 * Drill-in
 * ------------------------------------------------------------------ */

/**
 * Sample states, keyed by the city on the contact record.
 *
 * Contacts carry a city and a country and nothing between them, so the state a
 * map header wants ("Newstead, QLD") isn't on the record to read. These stand
 * in for the geocoder that would supply it, and an unknown city simply keeps
 * its own name rather than being given a state it might not be in.
 */
const SAMPLE_STATES: Record<string, string> = {
  sydney: "NSW",
  newcastle: "NSW",
  parramatta: "NSW",
  melbourne: "VIC",
  geelong: "VIC",
  richmond: "VIC",
  brisbane: "QLD",
  newstead: "QLD",
  "gold coast": "QLD",
  perth: "WA",
  fremantle: "WA",
  adelaide: "SA",
  hobart: "TAS",
  canberra: "ACT",
  darwin: "NT",
};

/**
 * Sample postcodes, keyed the same way as the states above and just as much a
 * stand-in for a geocoder.
 *
 * Worth being plain about the limit: a contact record carries no postcode, so a
 * postcode here can only be as precise as the suburb it was inferred from —
 * grouping by postcode gives the same buckets as grouping by suburb until the
 * field exists on the contact itself.
 */
const SAMPLE_POSTCODES: Record<string, string> = {
  sydney: "2000",
  newcastle: "2300",
  parramatta: "2150",
  melbourne: "3000",
  geelong: "3220",
  richmond: "3121",
  brisbane: "4000",
  newstead: "4006",
  "gold coast": "4217",
  perth: "6000",
  fremantle: "6160",
  adelaide: "5000",
  hobart: "7000",
  canberra: "2600",
  darwin: "0800",
};

/** Postcode back to its state, so a postcode row can still name where it is. */
const STATE_BY_POSTCODE: Record<string, string> = Object.fromEntries(
  Object.entries(SAMPLE_POSTCODES).flatMap(([city, postcode]) => {
    const state = SAMPLE_STATES[city];
    return state ? [[postcode, state]] : [];
  }),
);

/**
 * The state an area sits in, where the sample knows one. Null covers all three
 * ways it can be unknown: the unspecified bucket, an overseas area, and a city
 * the sample has never heard of.
 */
export function areaState(label: string): string | null {
  if (label === UNSPECIFIED_AREA || label.includes(",")) return null;
  return SAMPLE_STATES[label.trim().toLowerCase()] ?? null;
}

/**
 * The area as a map would label it — city plus state where one is known.
 * Overseas areas already carry their country from `areaLabelFor`, and the
 * unspecified bucket is left exactly as it is: it names a gap, not a place.
 */
export function areaDisplayName(
  label: string,
  level: AreaLevel = DEFAULT_AREA_LEVEL,
): string {
  if (level === "state") return label;
  if (level === "postcode") {
    const state = STATE_BY_POSTCODE[label];
    return state ? `${label}, ${state}` : label;
  }
  const state = areaState(label);
  return state ? `${label}, ${state}` : label;
}

export type AreaCustomer = {
  key: string;
  /** Null once the contact is deleted — the name survives, the record doesn't. */
  contactId: string | null;
  name: string;
  invoiced: number;
  paid: number;
  overdue: number;
  /** Value of quotes sitting with this client, undecided. */
  openQuotes: number;
  openQuoteCount: number;
};

export type CustomerAreaDetail = {
  key: string;
  /** As the map labels it, e.g. "Melbourne, VIC". */
  displayName: string;
  customerCount: number;
  invoiced: number;
  paid: number;
  overdue: number;
  overdueCount: number;
  /** Value of open quotes across the area. */
  quotePipeline: number;
  openQuoteCount: number;
  quotedValue: number;
  acceptedValue: number;
  /** Accepted as a share of quoted value, or null with nothing quoted yet. */
  conversion: number | null;
  customers: AreaCustomer[];
  /** How many of the area's addresses geocode to a street rather than a suburb. */
  addresses: { verified: number; total: number };
};

/**
 * Everything the drill-in shows about one area, from the same invoices, quotes
 * and contacts the rest of the dashboard reads. Figures are scoped to the area
 * and to nothing else, so they add up to the area's row in the ranking.
 */
export function customerAreaDetail(
  key: string,
  {
    invoices,
    quotes,
    contacts,
    level = DEFAULT_AREA_LEVEL,
  }: {
    invoices: Invoice[];
    quotes: Quote[];
    contacts: Contact[];
    level?: AreaLevel;
  },
): CustomerAreaDetail {
  const contactsById = new Map(
    contacts.map((contact) => [contact.id, contact]),
  );
  const inArea = (clientId: string | null) =>
    areaLabelFor(clientId ? contactsById.get(clientId) : undefined, level) ===
    key;

  const customers = new Map<string, AreaCustomer>();
  const entryFor = (
    clientId: string | null,
    fallbackName: string,
  ): AreaCustomer => {
    const contact = clientId ? contactsById.get(clientId) : undefined;
    // A deleted contact is grouped by the name the document kept, which is all
    // that's left of them; two live clients can share a name and still be two.
    const mapKey = contact ? contact.id : `name:${fallbackName}`;
    const existing = customers.get(mapKey);
    if (existing) return existing;

    const created: AreaCustomer = {
      key: mapKey,
      contactId: contact?.id ?? null,
      name: contact ? contactDisplayName(contact) : fallbackName,
      invoiced: 0,
      paid: 0,
      overdue: 0,
      openQuotes: 0,
      openQuoteCount: 0,
    };
    customers.set(mapKey, created);
    return created;
  };

  // Clients on the books here count as customers of the area even before
  // they're billed — the header counts who you have, not who has paid.
  for (const contact of contacts) {
    if (contact.type !== "Client" || areaLabelFor(contact, level) !== key) {
      continue;
    }
    entryFor(contact.id, contactDisplayName(contact));
  }

  for (const invoice of invoices) {
    if (!isBilled(invoice) || !inArea(invoice.clientId)) continue;

    const customer = entryFor(invoice.clientId, invoice.clientName);
    customer.invoiced += invoiceAmount(invoice);
    customer.paid += invoice.paidAmount;
    if (invoice.status === "Overdue") {
      customer.overdue += invoiceOutstanding(invoice);
    }
  }

  let quotedValue = 0;
  let acceptedValue = 0;

  for (const quote of quotes) {
    if (!isQuoted(quote) || !inArea(quote.clientId)) continue;

    const amount = quoteAmount(quote);
    quotedValue += amount;
    if (quote.status === "Accepted") acceptedValue += amount;

    const customer = entryFor(quote.clientId, quote.clientName);
    if (isOpenQuote(quote)) {
      customer.openQuotes += amount;
      customer.openQuoteCount += 1;
    }
  }

  const list = [...customers.values()];
  const sum = (pick: (customer: AreaCustomer) => number) =>
    list.reduce((total, customer) => total + pick(customer), 0);

  // Street-level means the record actually carries a street address; the rest
  // are only as precise as their suburb.
  const withRecord = list.filter((customer) => customer.contactId);
  const verified = withRecord.filter((customer) => {
    const contact = contactsById.get(customer.contactId as string);
    return Boolean(contact?.addressLine1.trim() && contact.city.trim());
  }).length;

  return {
    key,
    displayName: areaDisplayName(key, level),
    customerCount: list.length,
    invoiced: sum((customer) => customer.invoiced),
    paid: sum((customer) => customer.paid),
    overdue: sum((customer) => customer.overdue),
    overdueCount: list.filter((customer) => customer.overdue > 0).length,
    quotePipeline: sum((customer) => customer.openQuotes),
    openQuoteCount: sum((customer) => customer.openQuoteCount),
    quotedValue,
    acceptedValue,
    conversion:
      quotedValue > 0 ? Math.round((acceptedValue / quotedValue) * 100) : null,
    customers: list,
    addresses: { verified, total: withRecord.length },
  };
}
