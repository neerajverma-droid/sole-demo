/**
 * Journeys — the route a new account is put on by the end of Welcome.
 *
 * Five of them, and every account lands on exactly one. A journey isn't a plan
 * or a permission: it's a statement about how this business turns work into
 * money, which is the one fact that changes what "get started" should mean.
 * Someone paid on the spot at a market needs takings and costs; someone who
 * quotes a job first needs a quote that becomes an invoice. Same product, two
 * different first weeks.
 *
 * It's resolved from the industry wherever the industry is a good enough answer
 * on its own, and from one extra question where it isn't — see
 * `INDUSTRY_JOURNEY` and `PAYMENT_OPTIONS`. Those are the only two inputs on
 * purpose: a third question would buy accuracy nobody asked for at the cost of
 * the thing this flow is actually optimising, which is getting out of the way.
 */
import {
  Banknote,
  FileText,
  HeartHandshake,
  Landmark,
  type LucideIcon,
  Package,
  Receipt,
  Send,
  Users,
  Wallet,
} from "lucide-react";

import { NDIS_INDUSTRY, type Industry } from "@/lib/settings";

export type JourneyId = "j1" | "j2" | "j3" | "j3n" | "j4";

/** One thing to do, and the screen that does it. */
export type JourneyAction = {
  /** Stable across copy changes — what analytics counts, not the label. */
  id: string;
  label: string;
  /** One line under the label, saying what pressing it gets them. */
  helper: string;
  /** The real screen, deep-linked. Every one of these exists. */
  href: string;
  /**
   * The row's icon square.
   *
   * On the action rather than mapped from its id in the component: the
   * component renders whatever the journey hands it, and a map beside it would
   * be a second list to remember when an action is added.
   */
  icon: LucideIcon;
  /**
   * The CTA's label — the verb on its own.
   *
   * Separate from `label`, which is the whole sentence. "Send your first
   * invoice" is what the row says; "Send" is what the button says, and a
   * button that repeated the sentence would be a button the width of the row.
   *
   * One field for every action, the primary included. A second `primaryVerb`
   * beside it would hold the same kind of value in two places, and two places
   * holding one fact is how they end up disagreeing.
   */
  verb: string;
};

/**
 * What a journey asks for on day one.
 *
 * The primary is the route's first value — the single thing that makes the
 * product worth having opened, which is a different act per journey: money
 * recorded for a market stall, an invoice sent for a consultant, a claim
 * raised for an NDIS provider. Naming it per journey is the whole point of
 * having resolved one.
 *
 * The secondaries aren't steps two and three of a sequence. They're the other
 * two things this route commonly starts with, offered so someone whose week
 * doesn't begin with the primary still has something true to press.
 */
export type JourneyFirstRun = {
  primary: JourneyAction;
  secondary: JourneyAction[];
  /**
   * How long this route's first value should take, as a promise to the reader.
   *
   * Per journey because the routes genuinely differ — recording takings is a
   * form with three fields and an NDIS claim is not — and a single number
   * across all five would be wrong for at least four of them.
   */
  timeToValue: string;
};

export type Journey = {
  id: JourneyId;
  /** How the journey is referred to in the product spec and in analytics. */
  code: string;
  name: string;
  /** One line, in the person's own terms rather than the product's. */
  tagline: string;
  /** The day-one actions. See `JourneyFirstRun`. */
  firstRun: JourneyFirstRun;
};

/**
 * Add an expense, which every route offers.
 *
 * The one action all five journeys share: money going out is the half of the
 * books that doesn't depend on how money comes in. Written once rather than
 * five times, so it can't end up pointing at two different screens.
 */
const ADD_EXPENSE: JourneyAction = {
  id: "add-expense",
  label: "Add an expense",
  helper: "Snap a receipt or type it in — it counts towards your deductions.",
  href: "/expenses/new",
  icon: Wallet,
  verb: "Add",
};

export const JOURNEYS: Journey[] = [
  {
    id: "j1",
    code: "J1",
    name: "Keep my money organised",
    tagline: "Money lands, and the books keep up with it.",
    firstRun: {
      // Nothing is invoiced on this route, so the first real act is recording
      // what came in. A "send an invoice" primary here would be the product
      // asking someone to do a thing their business never does.
      primary: {
        id: "record-takings",
        label: "Record this week's takings",
        helper: "Enter what came in and your books start from today.",
        href: "/transactions/new",
        icon: Receipt,
        verb: "Record",
      },
      secondary: [
        {
          id: "connect-bank",
          label: "Connect your bank",
          helper: "Let the feed bring transactions in so you're not typing them.",
          href: "/transactions",
          icon: Landmark,
          verb: "Connect",
        },
        ADD_EXPENSE,
      ],
      timeToValue: "Under 5 minutes",
    },
  },
  {
    id: "j2",
    code: "J2",
    name: "Quote, complete and collect",
    tagline: "Price the job, do the job, get paid for the job.",
    firstRun: {
      primary: {
        id: "send-invoice",
        label: "Send your first invoice",
        helper: "Bill a job you've already done and get the money moving.",
        href: "/invoices/new",
        icon: Send,
        verb: "Send",
      },
      secondary: [
        {
          // First on this route rather than second-guessed: quoting is what
          // makes it J2, and someone mid-pipeline needs it before invoicing.
          id: "write-quote",
          label: "Write a quote",
          helper: "Price a job now — accept it later and it becomes an invoice.",
          href: "/quotes/new",
          icon: FileText,
          verb: "Write",
        },
        ADD_EXPENSE,
      ],
      timeToValue: "Under 10 minutes",
    },
  },
  {
    id: "j3",
    code: "J3",
    name: "Bill for services and collect",
    tagline: "Send the invoice, chase what's late, watch it clear.",
    firstRun: {
      primary: {
        id: "send-invoice",
        label: "Send your first invoice",
        helper: "Bill for work you've done and get the money moving.",
        href: "/invoices/new",
        icon: Send,
        verb: "Send",
      },
      secondary: [
        {
          id: "add-client",
          label: "Add a client",
          helper: "Save their details once and every invoice fills itself in.",
          href: "/contacts",
          icon: Users,
          verb: "Add",
        },
        ADD_EXPENSE,
      ],
      timeToValue: "Under 10 minutes",
    },
  },
  {
    id: "j3n",
    code: "J3-N",
    name: "NDIS service billing",
    tagline: "Bill participants and plan managers the way the scheme expects.",
    firstRun: {
      primary: {
        // Its own editor, not the general one — the claim needs fields the
        // standard invoice doesn't have, and sending the wrong shape is the
        // error this route can least afford on day one.
        id: "send-ndis-invoice",
        label: "Create your first NDIS invoice",
        helper: "The editor carries the support items and claim fields for you.",
        href: "/invoices/new/ndis",
        icon: HeartHandshake,
        verb: "Create",
      },
      secondary: [
        {
          id: "add-participant",
          label: "Add a participant",
          helper: "Their plan details sit with them, ready for the next claim.",
          href: "/contacts",
          icon: Users,
          verb: "Add",
        },
        ADD_EXPENSE,
      ],
      timeToValue: "Under 10 minutes",
    },
  },
  {
    id: "j4",
    code: "J4",
    name: "Sell goods and track costs",
    tagline: "Takings in, stock and costs out, margin in the middle.",
    firstRun: {
      primary: {
        id: "record-trading",
        label: "Record a trading period",
        helper: "A market, a shift or a week — takings in one entry.",
        href: "/transactions/new",
        icon: Banknote,
        verb: "Record",
      },
      secondary: [
        {
          id: "add-product",
          label: "Add a product",
          helper: "Set its price and cost once and your margin works itself out.",
          href: "/inventory/new",
          icon: Package,
          verb: "Add",
        },
        ADD_EXPENSE,
      ],
      timeToValue: "Under 10 minutes",
    },
  },
];

const JOURNEY_BY_ID: Record<JourneyId, Journey> = Object.fromEntries(
  JOURNEYS.map((journey): [JourneyId, Journey] => [journey.id, journey]),
) as Record<JourneyId, Journey>;

export function journeyById(id: JourneyId): Journey {
  return JOURNEY_BY_ID[id];
}

/* ------------------------------------------------------------------ *
 * Industry → journey
 * ------------------------------------------------------------------ */

/**
 * What an industry decides on its own, or `"ask"` where it can't.
 *
 * `"ask"` is a real answer rather than a gap. Retail is the clearest case: a
 * shop and a wholesaler are both retail and they get paid in completely
 * different ways, so guessing would put half of them on the wrong route with no
 * sign that a guess had been made. Where the industry genuinely settles it —
 * NDIS bills the scheme, a consultant invoices after the work — the fourth
 * question is skipped entirely, which is the whole reason this map exists.
 *
 * Keyed off `INDUSTRIES`, the list Settings, the invoice chooser and the
 * template gallery already read, rather than a second vocabulary of industry
 * names invented here. A typed industry — the "my industry isn't listed" route —
 * isn't in the map and so falls through to `"ask"`, which is the correct
 * treatment for an answer we've never seen before.
 *
 * Typed as a total map over `Industry` rather than as a loose record, so an
 * industry added to `INDUSTRIES` without a journey is a compile error. Left
 * loose it would silently route its accounts through the fourth question
 * forever, which looks like a decision and isn't one.
 *
 * TODO: investment property routes to J1 in the brief and has no industry to
 * hang off — it's an add-on in this product, not a line of work. It'll need
 * either an industry of its own or a signal from the add-on being switched on.
 */
export const INDUSTRY_JOURNEY: Record<Industry, JourneyId | "ask"> = {
  // Bills the scheme, on the scheme's terms. The one industry that names its
  // own journey.
  [NDIS_INDUSTRY]: "j3n",

  // Paid by the platform, after the fact and without an invoice anyone here
  // raises — so there's nothing to quote and nothing to chase, only money to
  // keep straight.
  "Transport & logistics": "j1",

  // Work first, invoice after. None of these quote a fixed price before
  // starting often enough to make quoting the default.
  "Admin Services": "j3",
  Consulting: "j3",
  "Professional services": "j3",
  Finance: "j3",
  Insurance: "j3",
  // Brand and content work, billed on delivery — the media end of creative
  // work, as distinct from the Creatives row below, which covers commissioned
  // work that's usually quoted first.
  Influencers: "j3",

  // Everything the industry can't settle. Trades and construction quote as
  // often as they don't; a beauty room takes payment at the chair but also runs
  // packages; hospitality and retail can be a till, a market stall or a
  // wholesale ledger; commissioned creative work splits the same way. One
  // question sorts all of them, and it's cheaper than being wrong.
  Trades: "ask",
  Construction: "ask",
  "Make up": "ask",
  "Food services": "ask",
  Retail: "ask",
  Manufacturers: "ask",
  Creatives: "ask",
  Arts: "ask",
  "Personal Trainers / Fitness": "ask",
  // The catch-all says nothing by definition, so it asks.
  Other: "ask",
};

/* ------------------------------------------------------------------ *
 * The fourth question
 * ------------------------------------------------------------------ */

export type PaymentOption = {
  id: string;
  label: string;
  journey: JourneyId;
};

/**
 * "How does money usually reach you?" — asked only of the industries above that
 * answer `"ask"`.
 *
 * Phrased as what happens rather than as what the product would call it: nobody
 * describes their week as "accrual service billing", they describe it as doing
 * the work and sending a bill. Each answer names exactly one journey, so this
 * question can't return an ambiguous result.
 */
export const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: "on-the-spot",
    label: "I'm paid on the spot",
    journey: "j1",
  },
  {
    id: "quote-then-invoice",
    label: "I quote first, then invoice",
    journey: "j2",
  },
  {
    id: "work-then-invoice",
    label: "I do the work, then invoice",
    journey: "j3",
  },
  {
    id: "takings",
    label: "Takings from a shop, market or platform",
    journey: "j4",
  },
  {
    // Not a non-answer — it's the most common honest one, and it has to lead
    // somewhere. Invoicing is the route that costs least to be wrong about:
    // every other journey is reachable from it without redoing anything.
    id: "varies",
    label: "It varies, or I'm not sure yet",
    journey: "j3",
  },
];

export function paymentOptionById(id: string): PaymentOption | undefined {
  return PAYMENT_OPTIONS.find((option) => option.id === id);
}

/**
 * Where an unanswered fourth question lands.
 *
 * Only reachable if something skips the question the flow says is mandatory.
 * Named rather than inlined so the fallback is one decision in one place.
 */
export const FALLBACK_JOURNEY: JourneyId = "j3";

/**
 * The journey for an industry, consulting the payment answer only when the
 * industry can't decide.
 *
 * Returns `"ask"` rather than guessing when the industry is ambiguous and no
 * payment answer has been given — that return value is what a caller reads to
 * decide whether the payment question is worth putting in front of someone.
 */
export function journeyFor(
  industry: string,
  paymentAnswer?: string | null,
): JourneyId | "ask" {
  // Cast on the way in rather than on the way out: what arrives here is a
  // stored string, which may be a typed industry the map has never heard of.
  const fromIndustry = (
    INDUSTRY_JOURNEY as Record<string, JourneyId | "ask" | undefined>
  )[industry.trim()];
  // Unmapped industries — anything typed rather than picked — behave like the
  // catch-all, which is to ask rather than to assume.
  if (fromIndustry && fromIndustry !== "ask") return fromIndustry;
  if (!paymentAnswer) return "ask";
  return paymentOptionById(paymentAnswer)?.journey ?? FALLBACK_JOURNEY;
}

/**
 * Whether the payment question is worth asking for this industry.
 *
 * Nothing calls this while Welcome is a single screen — the profile resolves
 * the journey from the industry alone and lets `resolveJourney` narrow the
 * ambiguous ones. It stays because it's the other half of `journeyFor`'s
 * contract: the moment the payment question is asked anywhere, this is what
 * decides who sees it, and deriving that from a raw `=== "ask"` comparison at
 * the call site is how two surfaces end up disagreeing about it.
 */
export function needsPaymentQuestion(industry: string): boolean {
  return journeyFor(industry) === "ask";
}

/**
 * The same resolution, narrowed to a journey that actually exists.
 *
 * The confirmation screen has to name a journey, and by the time it renders the
 * fourth question has either been answered or was never asked — so `"ask"` is
 * unreachable here in practice. It still can't be returned, because a screen
 * that renders `undefined.name` on an edge case nobody predicted is worse than
 * one that quietly picks the safest route.
 */
export function resolveJourney(
  industry: string,
  paymentAnswer?: string | null,
): JourneyId {
  const resolved = journeyFor(industry, paymentAnswer);
  return resolved === "ask" ? FALLBACK_JOURNEY : resolved;
}
