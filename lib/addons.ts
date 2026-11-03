/**
 * The add-ons catalogue.
 *
 * An add-on is a part of the product someone can switch on when their business
 * needs it, rather than a permanent row in the nav that most people will never
 * open. The rail stays short because the catalogue is opt-in, not because
 * anything has been hidden — everything here is one click and a price away.
 *
 * Copy lives with the add-on rather than in the marketplace component: the
 * marketplace is one layout rendering whichever add-on is selected, and copy
 * that sits in the layout is copy that has to be edited in a component.
 */

import {
  Briefcase,
  CalendarDays,
  LayoutGrid,
  Link2,
  Clock,
  Home,
  Landmark,
  Map,
  Users2,
  type LucideIcon,
} from "lucide-react";

export const ADDON_GROUPS = [
  { key: "finance", label: "Finance add-ons", pill: "Finance" },
  { key: "operations", label: "Operations add-ons", pill: "Operations" },
] as const;

/**
 * How each category is coloured, so a card's category is legible before its
 * label is read — which is the whole point of colouring them.
 *
 * Finance takes the brand indigo and Operations the teal the nav already
 * reserves as its one non-brand accent (`teal-600` in light, `teal-400` in
 * dark). The brief named #14B8A6, which is `teal-500`; these are the shades the
 * product already uses for teal, and holding to them keeps this modal on the
 * palette rather than a step off it.
 */
export type AddonAccent = {
  /** The strip along the top of a featured card. */
  strip: string;
  /** The icon tile, tinted. */
  tile: string;
  /** The category pill on a featured card. */
  pill: string;
  /** The featured card's own wash — indigo-50 and teal-50, as asked. */
  wash: string;
  /**
   * The card's primary CTA, over the default Button variant.
   *
   * Finance is empty because the default variant is already the brand indigo —
   * an override repeating what the variant says is one more place to forget when
   * the token moves. Operations restates the fill, the text on it, the hover and
   * the focus ring, because a solid button that changes colour has to change all
   * four or it ends up teal with an indigo halo.
   */
  cta: string;
};

export const ADDON_ACCENT: Record<AddonGroup, AddonAccent> = {
  finance: {
    strip: "bg-primary",
    tile: "bg-primary/10 text-primary",
    pill: "border-transparent bg-primary/10 text-primary",
    wash: "bg-indigo-50/70 dark:bg-primary/[0.07]",
    cta: "",
  },
  operations: {
    strip: "bg-teal-600 dark:bg-teal-400",
    tile: "bg-teal-600/10 text-teal-700 dark:bg-teal-400/10 dark:text-teal-400",
    pill: "border-transparent bg-teal-600/10 text-teal-700 dark:bg-teal-400/10 dark:text-teal-400",
    wash: "bg-teal-50/70 dark:bg-teal-400/[0.07]",
    // The solid-teal pair the product already uses for filled teal surfaces
    // (see `BUSINESS_AVATARS`): teal-600 under white in light, teal-500 under
    // teal-950 in dark, where a light fill needs dark text to stay legible.
    cta:
      "bg-teal-600 text-white hover:bg-teal-600/90 focus-visible:ring-teal-600 " +
      "dark:bg-teal-500 dark:text-teal-950 dark:hover:bg-teal-500/90 dark:focus-visible:ring-teal-400",
  },
};

export type AddonGroup = (typeof ADDON_GROUPS)[number]["key"];

export type Addon = {
  id: string;
  /**
   * What this add-on is called on the subscription.
   *
   * The two catalogues grew up apart: these ids name a card in this modal, and
   * `user_subscriptions.addons` holds the slugs Stripe bills against — so
   * `assets` here is `assets-advanced` there, `scheduling` is `booking`, and
   * `projects` is `project`. Nothing joined them until this field, which is why
   * the modal used to show a locked card to someone already paying for it.
   *
   * The slug is the one the server knows; it is what goes up in a plan change
   * and what comes back in `SubscriptionInfo.addons`. An add-on with no slug is
   * one the backend has no plan row for, and can't be bought.
   */
  slug?: string;
  /**
   * Promoted to the modal's featured row — one per category, at most.
   *
   * A flag on the add-on rather than a list in the component: which two are
   * worth leading with is a fact about the catalogue, and a component holding
   * its own ids would keep pointing at them after they were renamed or dropped.
   */
  featured?: boolean;
  name: string;
  /** One line, for the rail and the sidebar row. Says what it's for, not what it is. */
  subtext: string;
  priceMonthly: number;
  /**
   * Set when `priceMonthly` is per unit rather than flat — payroll is billed
   * per employee seat, so its card says "per employee" rather than implying
   * one price covers the business.
   */
  priceUnit?: "employee";
  group: AddonGroup;
  icon: LucideIcon;
  /** Where its nav row goes once added; absent means the feature is still coming. */
  href?: string;
  /**
   * The add-on's own pages, when it has more than one — its row becomes a
   * group with these under it, the way a main row like Sales holds its own.
   */
  pages?: { id: string; label: string; href: string; icon?: LucideIcon }[];
  /**
   * Nav module ids this add-on supersedes.
   *
   * Some add-ons aren't a new part of the product but a bigger version of one
   * already in the rail. Adding the asset register doesn't give someone a
   * second place to keep assets — it gives them a better one — so the row it
   * replaces has to go, or the rail offers the same job twice and it's anyone's
   * guess which one is live.
   *
   * Nav ids, not add-on ids: what's being replaced is a row in MAIN, and the
   * two are separate namespaces. Declared here rather than as a list in the
   * sidebar so the next add-on that supersedes something says so in its own
   * definition, where whoever writes it is already looking.
   */
  replaces?: string[];
  /** The subject of the video placeholder — "Watch: {this} in 90 seconds". */
  video: string;
  overview: string;
  whatItDoes: string;
  whyItHelps: string;
  howItWorks: string;
  /** Three, deliberately: a strip of bullets stops being scannable past that. */
  benefits: [string, string, string];
  included: string[];
};

/**
 * The reference add-on, written out in full.
 *
 * Every section answers a different question, in the order someone asks them:
 * what am I looking at, what does it do, why would I bother, and what happens
 * when I switch it on. None of them repeat the others, which is the whole test
 * of whether four headings were worth having.
 */
const INVESTMENT_PROPERTY: Addon = {
  id: "investment",
  slug: "investment",
  name: "Investment property",
  subtext: "Track rent, expenses and depreciation per property",
  priceMonthly: 12,
  group: "finance",
  icon: Home,
  href: "/investment-property",
  video: "investment property tracking",
  overview:
    "A property ledger that sits alongside your business books instead of in a spreadsheet beside them. Each property gets its own income, expenses and depreciation, and your tax position stays one number rather than two you have to reconcile at the end of the year.",
  whatItDoes:
    "Adds a property register, per-property transactions, and a depreciation schedule for capital works and fittings. Rent arrives as income against a property, agent fees and rates as expenses against the same one, and every figure carries the property it belongs to through to reporting.",
  whyItHelps:
    "A rental property is the most common reason a sole trader's tax gets complicated, and the usual answer is a second spreadsheet nobody reconciles until July. Keeping it here means your deductions are already itemised, already dated, and already attached to the right property when your accountant asks.",
  howItWorks:
    "Add a property with its purchase price and settlement date. Code transactions to it as they come in from your bank feed, or enter them by hand. Sole works out the depreciation schedule from the purchase details and carries the year's claim into your tax estimate.",
  benefits: [
    "Per-property profit and loss, not one pooled total",
    "Depreciation worked out from the purchase, not by hand",
    "Deductions itemised and dated before you need them",
  ],
  included: [
    "Property register with purchase and settlement details",
    "Per-property income, expenses and net position",
    "Capital works and fittings depreciation schedules",
    "Rent and agent-fee coding straight from the bank feed",
    "Property breakdown in the tax estimator",
  ],
};

/**
 * The rest of the catalogue.
 *
 * Their copy is deliberately shorter than the reference's while the design is
 * being agreed — the shape is right, the depth follows once it is.
 */
export const ADDONS: Addon[] = [
  INVESTMENT_PROPERTY,
  {
    id: "assets",
    slug: "assets-advanced",
    name: "Assets",
    subtext: "A register of what you own, and what it's worth now",
    priceMonthly: 8,
    group: "finance",
    icon: Landmark,
    href: "/assets",
    // The paid tier of the Assets row that ships in MAIN, not a second
    // feature — same route, same icon, more of it. So the default row stands
    // down while this is on the plan.
    replaces: ["asset-register"],
    video: "the asset register",
    overview:
      "Everything the business owns in one register, with what it cost, what's still owed on it, and what it's worth after depreciation.",
    whatItDoes:
      "Records each asset with its purchase, finance and depreciation details, and keeps a running written-down value against it.",
    whyItHelps:
      "Depreciation is a deduction most sole traders under-claim because the paperwork is scattered. A register makes the claim a report rather than an afternoon.",
    howItWorks:
      "Add an asset manually or upload the invoice and let capture read it, pick a depreciation method, and the schedule follows.",
    benefits: [
      "Written-down value kept current, not recalculated yearly",
      "Finance and payout tracked against the asset",
      "Photos and receipts attached where the auditor looks",
    ],
    included: [
      "Asset register with categories and locations",
      "Straight-line and diminishing-value schedules",
      "Document capture from an invoice or receipt",
      "Asset listing report",
    ],
  },
  {
    id: "projects",
    slug: "project",
    featured: true,
    name: "Projects / milestones",
    subtext: "Group work into jobs and bill against milestones",
    priceMonthly: 10,
    group: "operations",
    icon: Briefcase,
    // The old app's own routes — the project detail page lives under the list.
    href: "/projects",
    pages: [
      {
        id: "projects-list",
        label: "Projects",
        href: "/projects",
        icon: Briefcase,
      },
      {
        id: "projects-settings",
        label: "Project Settings",
        href: "/projects/settings",
        icon: LayoutGrid,
      },
    ],
    video: "project and milestone billing",
    overview:
      "Jobs with a budget, a schedule of milestones, and every invoice and expense attached to the one that paid for it.",
    whatItDoes:
      "Adds projects and milestones, and lets invoices, quotes and expenses be coded to them so a job's margin is a figure rather than a guess.",
    whyItHelps:
      "Quoting the next job well depends on knowing what the last one actually cost, which is the thing nobody records at the time.",
    howItWorks:
      "Create a project, set its milestones and budget, then code work to it as you go. Bill a milestone and the invoice carries the link.",
    benefits: [
      "Margin per job, not per month",
      "Milestone billing without a separate tracker",
      "Budget against actuals as the job runs",
    ],
    included: [
      "Projects with budgets and due dates",
      "Milestone schedule and progress billing",
      "Invoice, quote and expense coding to a project",
      "Per-project profitability",
    ],
  },
  {
    id: "scheduling",
    slug: "booking",
    name: "Scheduling",
    subtext: "A calendar and task list tied to your jobs",
    priceMonthly: 6,
    group: "operations",
    icon: CalendarDays,
    /*
     * The old app's own route, and where the backend sends the browser back
     * to after Google's consent screen (`?google_cal_status=…`).
     */
    href: "/calendar",
    pages: [
      {
        id: "scheduling-calendar",
        label: "Calendar",
        href: "/calendar",
        icon: CalendarDays,
      },
      {
        id: "scheduling-planner",
        label: "Planner",
        href: "/planner",
        icon: LayoutGrid,
      },
      {
        id: "scheduling-booking-links",
        label: "Booking Links",
        href: "/booking-links",
        icon: Link2,
      },
    ],
    video: "scheduling and tasks",
    overview:
      "The week ahead in one calendar, with the tasks and jobs behind each booking attached to it.",
    whatItDoes:
      "Adds a calendar and task list that read from your projects and clients, so a booking knows who it's for and what it's against.",
    whyItHelps:
      "A booking in a separate calendar is a booking nobody bills. Keeping it here means the work and the invoice share a record.",
    howItWorks:
      "Book work against a client or project, tick tasks off as they're done, and raise the invoice from the booking.",
    benefits: [
      "Bookings that know which job they belong to",
      "Tasks against the work, not a separate list",
      "Invoice straight from a completed booking",
    ],
    included: [
      "Calendar with client and project links",
      "Task lists per job",
      "Reminders for upcoming work",
    ],
  },
  {
    id: "time-tracker",
    slug: "time",
    name: "Time tracker",
    subtext: "Bill hours you'd otherwise round down",
    priceMonthly: 6,
    group: "operations",
    icon: Clock,
    href: "/time-tracker",
    video: "time tracking",
    overview:
      "A timer and timesheet that turn tracked hours into invoice lines at your own rates.",
    whatItDoes:
      "Records time against a client, project or task, and converts approved entries into billable lines on an invoice.",
    whyItHelps:
      "Hours reconstructed at the end of the week are hours under-billed. Tracked at the time, they're revenue.",
    howItWorks:
      "Start a timer or enter hours, assign them to a client or project, then pull the week's entries onto an invoice.",
    benefits: [
      "Hours captured as they happen",
      "Rates per client or per project",
      "Timesheet to invoice in one step",
    ],
    included: [
      "Timer and manual timesheet entry",
      "Billable and non-billable time",
      "Rate cards per client",
      "Time on invoice lines",
    ],
  },
  {
    id: "km-tracker",
    slug: "km",
    name: "KM tracker",
    subtext: "Log trips and claim the cents-per-kilometre rate",
    priceMonthly: 5,
    group: "operations",
    icon: Map,
    href: "/km-tracker",
    video: "kilometre logging",
    overview:
      "A trip log and vehicle register that work out your motor-vehicle claim at the ATO's rate.",
    whatItDoes:
      "Records trips against a vehicle and a purpose, totals your business kilometres, and applies the current cents-per-kilometre rate.",
    whyItHelps:
      "The cents-per-kilometre method needs a record you can produce, and the logbook method needs twelve continuous weeks. Both need logging as you drive.",
    howItWorks:
      "Add your vehicles, log each trip's start, end and purpose, and the claim totals itself for the year.",
    benefits: [
      "Trips logged as you drive, not reconstructed",
      "Claim calculated at the current rate",
      "Records in the form the ATO asks for",
    ],
    included: [
      "Vehicle register",
      "Trip log with purpose and odometer",
      "Cents-per-kilometre and logbook methods",
      "Annual claim summary",
    ],
  },
  {
    id: "payroll",
    slug: "payroll",
    featured: true,
    name: "Payroll & STP",
    subtext: "Pay staff and report to the ATO each payday",
    // Per employee seat, prepaid, no free seats — see lib/payroll.ts.
    priceMonthly: 4.99,
    priceUnit: "employee",
    group: "finance",
    icon: Users2,
    href: "/payroll",
    video: "payroll and Single Touch Payroll",
    overview:
      "Pay runs with PAYG, super and Single Touch Payroll reporting, for the point a sole trader takes on their first employee.",
    whatItDoes:
      "Calculates gross to net with PAYG withholding and super guarantee, produces payslips, and files STP with the ATO each pay run.",
    whyItHelps:
      "The first employee is where doing your own books stops being viable, because STP is a reporting obligation with a deadline attached to every payday.",
    howItWorks:
      "Set up employees and pay rates, run a pay cycle, check the figures, and file. Super obligations carry into your existing contributions.",
    benefits: [
      "STP filed with each pay run",
      "PAYG and super calculated, not estimated",
      "Payslips out without a second system",
    ],
    included: [
      "Employee records and pay rates",
      "Weekly, fortnightly and monthly pay cycles",
      "PAYG withholding and super guarantee",
      "STP Phase 2 reporting",
      "Payslip delivery",
    ],
  },
];

export function addonById(id: string): Addon | undefined {
  return ADDONS.find((addon) => addon.id === id);
}

/**
 * Whether an add-on answers a search term — name and subtext, which is all the
 * text a browsing surface shows. One predicate, so the rail and the grid can't
 * disagree about what "matches" means.
 */
function matchesQuery(addon: Addon, needle: string): boolean {
  return (
    !needle ||
    addon.name.toLowerCase().includes(needle) ||
    addon.subtext.toLowerCase().includes(needle)
  );
}

/** The catalogue as the rail shows it: grouped, in catalogue order. */
export function addonsByGroup(query = ""): {
  group: (typeof ADDON_GROUPS)[number];
  addons: Addon[];
}[] {
  const needle = query.trim().toLowerCase();

  return ADDON_GROUPS.map((group) => ({
    group,
    addons: ADDONS.filter(
      (addon) => addon.group === group.key && matchesQuery(addon, needle),
    ),
  })).filter((entry) => entry.addons.length > 0);
}

/**
 * The grid's filter row: every group, plus an "All" that names none of them.
 *
 * Derived from the groups rather than written out beside them, so a group added
 * to the catalogue arrives as a pill instead of being silently unreachable.
 */
export const ADDON_FILTERS: string[] = [
  "All",
  ...ADDON_GROUPS.map((group) => group.pill),
];

/**
 * Whether the filter row is worth showing at all. Pills over a handful of items
 * are chrome that narrows nothing — the search box already does that job — so
 * they only earn their space once there's a list long enough to get lost in.
 */
export const ADDON_FILTERS_WORTHWHILE =
  ADDON_GROUPS.length > 1 && ADDONS.length >= 6;

/**
 * The modal's two rows: what leads, and what follows.
 *
 * Both respect the search and the category chip, so narrowing the list narrows
 * the featured row with it — a promoted card that survived a search it doesn't
 * match would be the one result that isn't a result.
 *
 * On "All" that's one card per category, ordered as `ADDON_GROUPS` is so Finance
 * leads. On a category it's that category's single pick, and everything else
 * drops to the grid.
 */
export function addonLayout(
  filter: string,
  query = "",
): { featured: Addon[]; compact: Addon[] } {
  const matches = addonsForFilter(filter, query);
  const promoted = matches.filter((addon) => addon.featured);

  const featured = ADDON_GROUPS.flatMap((group) =>
    // Sliced to one apiece, so a second flag in a category can't double the row.
    promoted.filter((addon) => addon.group === group.key).slice(0, 1),
  );

  const led = new Set(featured.map((addon) => addon.id));
  return { featured, compact: matches.filter((addon) => !led.has(addon.id)) };
}

/** The catalogue as the grid shows it: one flat list, filtered by pill and term. */
export function addonsForFilter(filter: string, query = ""): Addon[] {
  const needle = query.trim().toLowerCase();
  const group = ADDON_GROUPS.find((entry) => entry.pill === filter)?.key;

  return ADDONS.filter(
    (addon) => (!group || addon.group === group) && matchesQuery(addon, needle),
  );
}

/** Stored ids resolved to add-ons, dropping any the catalogue no longer has. */
export function addedAddons(ids: string[]): Addon[] {
  return ids.flatMap((id) => {
    const addon = addonById(id);
    return addon ? [addon] : [];
  });
}

/*
 * `addonMonthlyTotal` and `checkoutAddons` are both gone.
 *
 * The total summed the hardcoded `priceMonthly` on each card and ignored the
 * free-add-on allowance a package carries, so it disagreed with the invoice in
 * two directions at once. `addedMonthlyCost` in `lib/addon-entitlements.ts`
 * reads the price list and applies the allowance.
 *
 * `checkoutAddons` was a stub that returned `{ ok: true }` without touching a
 * payment method — every add-on in this catalogue was free, and nothing said
 * so. Buying goes through the subscription now: `hooks/use-addons.ts` adds the
 * slug to the Stripe subscription in place, or sends the person to Checkout
 * when there is no subscription to add it to.
 */

/** "$12/month", the one place the price is formatted. */
export function addonPrice(addon: Addon): string {
  return addon.priceUnit
    ? `$${addon.priceMonthly}/${addon.priceUnit}/month`
    : `$${addon.priceMonthly}/month`;
}
