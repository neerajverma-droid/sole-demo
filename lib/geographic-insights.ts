/**
 * The whole map, not the corner of it the dashboard shows.
 *
 * Every figure here is the same invoices, quotes and contacts the dashboard
 * card reads, aggregated by the client's suburb and state — and each area is
 * built by `customerAreaDetail`, the same function the drill-in panel uses. So
 * the page, the card and the panel can't disagree: they're one calculation seen
 * at three widths.
 */

import { contactDisplayName, type Contact } from "@/lib/contacts";
import {
  DEFAULT_AREA_LEVEL,
  areaLabelFor,
  areaState,
  customerAreaDetail,
  type AreaLevel,
  type CustomerAreaDetail,
} from "@/lib/customer-areas";
import type { Invoice } from "@/lib/invoices";
import type { Quote } from "@/lib/quotes";

/** The full view. A dashboard sub-route, because that's what links to it. */
export const GEOGRAPHIC_INSIGHTS_HREF = "/dashboard/geographic-insights";

/* ------------------------------------------------------------------ *
 * Metrics
 * ------------------------------------------------------------------ */

/**
 * What the map colours and sizes by, and what the ranking below it is ranked
 * on. One list drives the toggle, the legend, the panel's caption and the
 * ranking, so the control can never claim one thing while the bars show
 * another.
 */
export const GEO_METRICS = [
  { key: "invoiced", label: "Invoiced", noun: "invoiced value", money: true },
  { key: "paid", label: "Paid", noun: "paid value", money: true },
  { key: "overdue", label: "Overdue", noun: "overdue value", money: true },
  { key: "quotes", label: "Quotes", noun: "open quote value", money: true },
  {
    key: "customers",
    label: "Client count",
    noun: "client count",
    money: false,
  },
] as const;

export type GeoMetric = (typeof GEO_METRICS)[number]["key"];

export const DEFAULT_METRIC: GeoMetric = "invoiced";

export function metricMeta(metric: GeoMetric) {
  return GEO_METRICS.find((entry) => entry.key === metric) ?? GEO_METRICS[0];
}

export function metricValue(area: GeoArea, metric: GeoMetric): number {
  switch (metric) {
    case "paid":
      return area.paid;
    case "overdue":
      return area.overdue;
    case "quotes":
      return area.quotePipeline;
    case "customers":
      return area.customerCount;
    default:
      return area.invoiced;
  }
}

/* ------------------------------------------------------------------ *
 * Industry
 * ------------------------------------------------------------------ */

export const ALL_INDUSTRIES = "All industries";

/**
 * Sampled industries, read off the business name.
 *
 * A contact carries no industry field, so there is nothing on the record to
 * group by. Rather than invent one per contact at random — which would reshuffle
 * the filter on every render — it's derived from the name, which is stable and
 * at least sometimes right. The moment contacts gain a real field, this
 * function is the only thing that has to change.
 */
const INDUSTRY_KEYWORDS: [RegExp, string][] = [
  [
    /consult|advis|account|legal|law|design|studio|agency|partners/i,
    "Professional services",
  ],
  [/health|medical|dental|care|clinic|physio/i, "Health & community"],
  [
    /logistic|transport|freight|courier|haulage|removal/i,
    "Transport & logistics",
  ],
  [
    /build|construct|plumb|electric|roof|carpent|concret|paint/i,
    "Trades & construction",
  ],
  [/cafe|coffee|restaurant|catering|kitchen|bakery|brew/i, "Hospitality"],
  [/retail|store|shop|market|grocer/i, "Retail"],
];

const OTHER_INDUSTRY = "Other services";

export function contactIndustry(contact: Contact): string {
  const name = contactDisplayName(contact);
  for (const [pattern, industry] of INDUSTRY_KEYWORDS) {
    if (pattern.test(name)) return industry;
  }
  return OTHER_INDUSTRY;
}

/* ------------------------------------------------------------------ *
 * Areas
 * ------------------------------------------------------------------ */

/** An area of the map, with the state a header needs to name it. */
export type GeoArea = CustomerAreaDetail & {
  /** Null where the sample has no state for the area — see `areaState`. */
  state: string | null;
};

export type GeoTotals = {
  customers: number;
  invoiced: number;
  paid: number;
  overdue: number;
  quotePipeline: number;
  openQuoteCount: number;
  /** Accepted as a share of quoted value, or null with nothing quoted yet. */
  conversion: number | null;
};

export type GeoInsights = {
  /** Ranked by invoiced value; the page re-ranks by whatever is selected. */
  areas: GeoArea[];
  totals: GeoTotals;
  addresses: { verified: number; total: number };
  /** The state most of the money is in, which the page localises itself to. */
  leadingState: string | null;
  /** Every industry present in the data, for the filter. */
  industries: string[];
};

/**
 * A draft has never left the desk, so it says nothing about where the business
 * is. Mirrors `customerAreas`, which the dashboard card ranks on.
 */
function isBilled(invoice: Invoice): boolean {
  return invoice.status !== "Draft";
}

function isQuoted(quote: Quote): boolean {
  return quote.status !== "Draft";
}

export function geographicInsights({
  invoices,
  quotes,
  contacts,
  industry = ALL_INDUSTRIES,
  level = DEFAULT_AREA_LEVEL,
}: {
  invoices: Invoice[];
  quotes: Quote[];
  contacts: Contact[];
  industry?: string;
  /** How finely to group — the same choice the dashboard card is showing. */
  level?: AreaLevel;
}): GeoInsights {
  const contactsById = new Map(
    contacts.map((contact) => [contact.id, contact]),
  );
  const everyone = industry === ALL_INDUSTRIES;

  /**
   * A document belongs to the filter when its client does. A document whose
   * client has been deleted has no industry to test, so it survives "all
   * industries" and nothing narrower — filtering to Trades shouldn't quietly
   * include records that might be anything.
   */
  const matches = (clientId: string | null) => {
    if (everyone) return true;
    const contact = clientId ? contactsById.get(clientId) : undefined;
    return Boolean(contact && contactIndustry(contact) === industry);
  };

  // Contacts are narrowed alongside the documents, so an invoice's client is
  // still there to be looked up and the invoice can't fall into Unspecified
  // just because the filter dropped its contact.
  const scopedContacts = everyone
    ? contacts
    : contacts.filter((contact) => contactIndustry(contact) === industry);
  const scopedInvoices = invoices.filter((invoice) =>
    matches(invoice.clientId),
  );
  const scopedQuotes = quotes.filter((quote) => matches(quote.clientId));

  // Anywhere with a client on the books or a document against it is an area,
  // including the bucket that stands for having no location at all.
  const keys = new Set<string>();
  for (const contact of scopedContacts) {
    if (contact.type === "Client") keys.add(areaLabelFor(contact, level));
  }
  for (const invoice of scopedInvoices) {
    if (!isBilled(invoice)) continue;
    keys.add(
      areaLabelFor(
        invoice.clientId ? contactsById.get(invoice.clientId) : undefined,
        level,
      ),
    );
  }
  for (const quote of scopedQuotes) {
    if (!isQuoted(quote)) continue;
    keys.add(
      areaLabelFor(
        quote.clientId ? contactsById.get(quote.clientId) : undefined,
        level,
      ),
    );
  }

  const areas: GeoArea[] = [...keys]
    .map((key) => ({
      ...customerAreaDetail(key, {
        invoices: scopedInvoices,
        quotes: scopedQuotes,
        contacts: scopedContacts,
        level,
      }),
      // At state level the key already is the state; below it the sample
      // geocoder supplies one where it knows the city.
      state: level === "state" ? key : areaState(key),
    }))
    // An area with nothing in it is a leftover of the filter, not a place.
    .filter(
      (area) =>
        area.customerCount > 0 || area.invoiced > 0 || area.quotePipeline > 0,
    )
    .sort((a, b) => b.invoiced - a.invoiced);

  const sum = (pick: (area: GeoArea) => number) =>
    areas.reduce((total, area) => total + pick(area), 0);

  // Conversion off the summed values rather than an average of each area's
  // percentage, which would let a one-quote area outvote everywhere else.
  const quotedValue = sum((area) => area.quotedValue);
  const acceptedValue = sum((area) => area.acceptedValue);

  return {
    areas,
    totals: {
      customers: sum((area) => area.customerCount),
      invoiced: sum((area) => area.invoiced),
      paid: sum((area) => area.paid),
      overdue: sum((area) => area.overdue),
      quotePipeline: sum((area) => area.quotePipeline),
      openQuoteCount: sum((area) => area.openQuoteCount),
      conversion:
        quotedValue > 0
          ? Math.round((acceptedValue / quotedValue) * 100)
          : null,
    },
    addresses: {
      verified: sum((area) => area.addresses.verified),
      total: sum((area) => area.addresses.total),
    },
    leadingState: areas.find((area) => area.state)?.state ?? null,
    industries: [
      ...new Set(
        contacts
          .filter((contact) => contact.type === "Client")
          .map(contactIndustry),
      ),
    ].sort(),
  };
}

/* ------------------------------------------------------------------ *
 * Where a suggestion goes
 * ------------------------------------------------------------------ */

/**
 * The lists behind the suggestions, scoped to one area.
 *
 * Built here rather than in the card so the link and the figure printed on it
 * come from one place: `area` is the same key the totals were summed under, so
 * the list the link opens holds exactly the documents the figure counted.
 */
function areaHref(path: string, area: string, status?: string): string {
  const params = new URLSearchParams({ area });
  if (status) params.set("status", status);
  return `${path}?${params}`;
}

/** Quotes still with the client — the open pipeline the card names. */
export function areaQuotesHref(area: string): string {
  return areaHref("/quotes", area, "Sent");
}

export function areaInvoicesHref(area: string): string {
  return areaHref("/invoices", area);
}

export function areaOverdueHref(area: string): string {
  return areaHref("/invoices", area, "Overdue");
}

/* ------------------------------------------------------------------ *
 * What to do about it
 * ------------------------------------------------------------------ */

/**
 * The banner's two sentences, and the three suggestion cards, all come from
 * here — one area per question, picked by the figure that question is about.
 * Null where the figure is zero everywhere: there is no point naming the
 * most-overdue area when nothing is overdue.
 */
export type GeoLeaders = {
  /** Most invoiced — where the business actually is. */
  value: GeoArea | null;
  /** Most overdue — where the collections effort goes. */
  collect: GeoArea | null;
  /** Densest open pipeline — where following up is worth most. */
  pipeline: GeoArea | null;
};

export function geoLeaders(areas: GeoArea[]): GeoLeaders {
  const leader = (pick: (area: GeoArea) => number): GeoArea | null => {
    let best: GeoArea | null = null;
    for (const area of areas) {
      if (pick(area) > 0 && (!best || pick(area) > pick(best))) best = area;
    }
    return best;
  };

  return {
    value: leader((area) => area.invoiced),
    collect: leader((area) => area.overdue),
    pipeline: leader((area) => area.quotePipeline),
  };
}
