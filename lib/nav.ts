import {
  ArrowLeftRight,
  Banknote,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Boxes,
  Calculator,
  CircleDollarSign,
  Coins,
  Cog,
  CreditCard,
  Database,
  DollarSign,
  FileSpreadsheet,
  FileSignature,
  FileText,
  Landmark,
  LayoutGrid,
  LayoutList,
  Layers,
  LineChart,
  type LucideIcon,
  Map as MapIcon,
  Newspaper,
  Package,
  PiggyBank,
  ReceiptText,
  Route,
  Scale,
  SlidersHorizontal,
  Star,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

import { ADDONS, addonById } from "@/lib/addons";
import { MIGRATION_HREF } from "@/lib/migrations";
import { ALL_WIDGETS } from "@/lib/widgets";

export const RESOURCES_HREF = "/widget";
export const PROFILE_HREF = "/settings?section=profile";
export const REFERRAL_HREF = "/referral";
export const SOLE_PERKS_HREF = "/partners";

/**
 * Nav item with no `href` is present but non-navigating — it fires a
 * "coming soon" toast, per the design spec's Not Yet Designed list.
 */
export type NavLeaf = {
  id: string;
  label: string;
  href?: string;
  icon?: LucideIcon;
};

export type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  children?: NavLeaf[];
  tone?: "teal" | "red";
};

export type NavSection = {
  section: string;
  items: NavItem[];
};

/* ------------------------------------------------------------------ *
 * The two fixtures
 * ------------------------------------------------------------------ */

/**
 * Quick Actions and the Dashboard, which are fixtures rather than nav items.
 *
 * Deliberately not in `NAV`. Everything in NAV can be dragged, switched off and
 * pinned, because that's what the customise modal and the rail's reorder are
 * built over — and these two rows are meant to be none of those. Keeping them
 * out of the list is what makes them locked; there's no flag to honour and
 * nothing to remember to exclude.
 *
 * The sidebar draws them in their own slot under the header. They're added to
 * `searchTargets` by hand for the same reason: the palette walks NAV, and a
 * destination that isn't in NAV would otherwise be unreachable by search.
 */
export const QUICK_ACTIONS_NAV = {
  label: "Quick Actions",
  href: "/quick-actions",
} as const;

export const DASHBOARD_NAV = {
  label: "Dashboard",
  href: "/dashboard",
  icon: LayoutGrid,
} as const;

/* ------------------------------------------------------------------ *
 * The rail's sections
 * ------------------------------------------------------------------ */

/** The section the defaults and anything added from More live in. */
export const MAIN_SECTION = "Main";

/**
 * The section an add-on gets a row in once it's added.
 *
 * Its own heading rather than a run of rows in Main: what's in it is what
 * someone is paying for, and a paid row sitting indistinguishably among the
 * free ones makes "what am I subscribed to" a question you can only answer by
 * opening More.
 */
export const ADDONS_SECTION = "Add-ons";

/**
 * The rail's shipped defaults.
 *
 * Four rows, on the industry-defaults pattern: the rail opens with the handful
 * most businesses use every day, and everything else in the product is one
 * click away in More rather than permanently down the side. These four are
 * placeholders — the real set will come from the industry chosen at onboarding —
 * so this is deliberately a plain list rather than anything keyed by industry.
 */
export const NAV: NavSection[] = [
  {
    section: MAIN_SECTION,
    items: [
      {
        id: "transactions",
        label: "Transactions",
        icon: ArrowLeftRight,
        children: [
          {
            id: "all-transactions",
            label: "All transactions",
            href: "/transactions",
            icon: Banknote,
          },
          {
            id: "matching-rules",
            label: "Matching Rules",
            href: "/transactions/rules",
            icon: SlidersHorizontal,
          },
          {
            id: "payments",
            label: "Payments",
            href: "/transactions/payments",
            icon: CreditCard,
          },
        ],
      },
      {
        id: "contacts",
        label: "Contacts",
        href: "/contacts",
        icon: Users,
      },
      // Its own module, as in sole-webapp — not one of the Sales documents.
      {
        id: "proposals",
        label: "Proposals",
        href: "/proposals",
        icon: FileSignature,
      },
      {
        id: "sales",
        label: "Sales",
        icon: ReceiptText,
        children: [
          { id: "quotes", label: "Quotes", href: "/quotes", icon: FileText },
          {
            id: "invoices",
            label: "Invoices",
            href: "/invoices",
            icon: Newspaper,
          },
          {
            id: "client-refund",
            label: "Client refund",
            href: "/sales/client-refunds",
            icon: FileText,
          },
          {
            id: "products",
            label: "Product & services",
            href: "/sales/products",
            icon: LayoutList,
          },
          {
            id: "inventory",
            label: "Inventory",
            href: "/inventory",
            icon: Boxes,
          },
          {
            id: "sales-settings",
            label: "Sales settings",
            href: "/sales/settings",
            icon: Cog,
          },
        ],
      },
      {
        id: "expenses",
        label: "Expenses",
        icon: DollarSign,
        children: [
          {
            id: "expenses-list",
            label: "Expenses",
            href: "/expenses",
            icon: CircleDollarSign,
          },
          {
            id: "planner",
            label: "Business planner",
            href: "/expenses/business-planner",
            icon: PiggyBank,
          },
          {
            id: "vendor-refund",
            label: "Vendor refund",
            href: "/expenses/vendor-refunds",
            icon: FileText,
          },
          {
            id: "super",
            label: "Super contributions",
            href: "/expenses/super-contributions",
            icon: Zap,
          },
        ],
      },
      {
        id: "payroll-group",
        label: "Payroll",
        icon: Banknote,
        children: [
          { id: "payroll-overview", label: "Overview", href: "/payroll" },
          {
            id: "payroll-employees",
            label: "Employees",
            href: "/payroll/employees",
          },
          {
            id: "payroll-payruns",
            label: "Pay runs",
            href: "/payroll/payruns",
          },
          { id: "payroll-leave", label: "Leave", href: "/payroll/leave" },
          {
            id: "payroll-reports",
            label: "Reports",
            href: "/payroll/reports",
          },
        ],
      },
      {
        /*
         * Not `assets`, which is the add-on's id. The two are separate
         * namespaces — pins, hidden rows and section order are keyed by nav
         * ids, while the plan is keyed by add-on ids — and one string meaning
         * both would make removing the add-on quietly unpin the free row it
         * replaced. See `Addon.replaces`, which points here.
         */
        id: "asset-register",
        label: "Assets",
        href: "/assets",
        // The add-on's own icon: this is the same module at a lower tier, and
        // a row that changed picture on upgrade would read as a different one.
        icon: Landmark,
      },
      {
        /*
         * Not `km-tracker`, which is the add-on's id — the same separation as
         * `payroll-group` above. A group rather than a flat add-on row because
         * the module is three places, the two sole-webapp's sidebar listed
         * plus Reports, which it only reached from a button. Being in Main
         * also keeps the add-on from drawing a second row for the same route
         * (`addonRows` skips an href Main already has).
         */
        id: "km-tracker-group",
        label: "KM Tracker",
        icon: MapIcon,
        children: [
          {
            id: "km-trips",
            label: "All trips",
            href: "/km-tracker",
            icon: Route,
          },
          {
            id: "km-reports",
            label: "Reports",
            href: "/km-tracker/reports",
            icon: FileSpreadsheet,
          },
          {
            id: "km-settings",
            label: "Settings",
            href: "/km-tracker/settings",
            icon: Cog,
          },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Additional items
 * ------------------------------------------------------------------ */

/**
 * An item that starts life in More rather than in the rail.
 *
 * Same shape as any other row, plus the one line of copy More needs. A card in
 * a catalogue has to say what the thing is; a row in the rail has its section
 * and its neighbours to say it, which is why only these carry a description.
 */
export type AdditionalNavItem = NavItem & { description: string };

/**
 * The Migrations row's id.
 *
 * Named because two places now reach for it by hand: the catalogue below, and
 * first run's acknowledgment, which adds the row when someone says they're
 * arriving from another tool. A string typed twice is a row that silently
 * stops being added the day the id changes.
 */
export const MIGRATIONS_NAV_ID = "migrations";

/**
 * The parts of the product that aren't in the rail by default.
 *
 * Still full nav items — same ids, routes, submenus and pins as when they were
 * shipped in Main — because they're the same destinations. What's changed is
 * where they start: in More, until someone adds one. That's what keeps every
 * route reachable by search and every submenu intact for the day one is added.
 */
export const ADDITIONAL_NAV: AdditionalNavItem[] = [
  {
    id: "liabilities",
    label: "Liabilities & equity",
    icon: Wallet,
    description: "Loans, credit cards and the money you've put in yourself.",
    children: [
      {
        id: "liability",
        label: "Liability",
        href: "/liabilities",
        icon: CreditCard,
      },
      {
        id: "equity",
        label: "Equity / capital",
        href: "/equity",
        icon: Coins,
      },
    ],
  },

  {
    id: "reporting",
    label: "Reporting suite",
    icon: LineChart,
    description: "Profit & loss, balance sheet, BAS and eight more reports.",
    children: [
      {
        id: "pl",
        label: "Profit & loss",
        href: "/reports/profit-loss",
        icon: BarChart3,
      },
      {
        // Not in sole-webapp's own reporting submenu (its entry is
        // commented out) — `Scale` for the same "two sides balance" idea
        // `BarChart3` or `FileText` wouldn't carry.
        id: "balance-sheet",
        label: "Balance sheet",
        href: "/reports/balance-sheet",
        icon: Scale,
      },
      {
        // Also not in the reference — a trend icon for the same reason
        // `BarChart3` is Profit & Loss's: this report is money over time.
        id: "cash-flow",
        label: "Cash flows",
        href: "/reports/cash-flow",
        icon: TrendingUp,
      },
      {
        // Not in the reference either — `BookOpenCheck` for "the ledger that
        // checks out", distinct from the plain `BookOpen` Chart of Accounts
        // uses below.
        id: "trial-balance",
        label: "Trial balance",
        href: "/reports/trial-balance",
        icon: BookOpenCheck,
      },
      {
        id: "txn-listing",
        label: "Transaction listing",
        href: "/reports/transaction-listing",
        icon: FileText,
      },
      { id: "bas", label: "BAS report", href: "/reports/bas", icon: FileText },
      {
        id: "asset-listing",
        label: "Asset listing",
        href: "/reports/asset-listing",
        icon: Layers,
      },
      {
        id: "cust-supplier",
        label: "Customer / supplier report",
        href: "/reports/customer-supplier",
        icon: Users,
      },
      {
        id: "coa",
        label: "Chart of accounts",
        href: "/reports/chart-of-accounts",
        icon: BookOpen,
      },
      {
        id: "audit-trail",
        label: "Audit trail",
        href: "/reports/audit-trail",
        icon: FileText,
      },
      {
        id: "depreciation",
        label: "Depreciation reports",
        href: "/assets/depreciation-report",
        icon: Calculator,
      },
      {
        // `Package` for the one entry here that isn't a single report: a pack
        // bundles several of the reports above into one PDF.
        id: "report-packs",
        label: "Report packs",
        href: "/reports/packs",
        icon: Package,
      },
    ],
  },
  {
    id: MIGRATIONS_NAV_ID,
    label: "Migrations",
    icon: Database,
    href: MIGRATION_HREF,
    description: "Bring your books across from another accounting tool.",
  },
  {
    id: "reputation",
    label: "Reputation",
    icon: Star,
    href: "/reputation",
    description: "Collect client ratings, recover unhappy clients and win Google reviews.",
  },
  // Both had a page but no way in from the rail or More — tax estimator only
  // through Resources, geographic insights only from a dashboard card.
  {
    id: "tax-estimator",
    label: "Tax estimator",
    icon: Calculator,
    href: "/tax-estimator",
    description: "Estimate your quarterly and annual tax as you go.",
  },
  {
    id: "geographic-insights",
    label: "Geographic insights",
    icon: MapIcon,
    href: "/dashboard/geographic-insights",
    description: "See where your customers and invoices are, by area.",
  },
];

const ADDITIONAL_BY_ID: Record<string, AdditionalNavItem> = Object.fromEntries(
  ADDITIONAL_NAV.map((item): [string, AdditionalNavItem] => [item.id, item]),
);

/** One additional item, or nothing if the id no longer names one. */
export function additionalById(id: string): AdditionalNavItem | undefined {
  return ADDITIONAL_BY_ID[id];
}

/**
 * Main's roster: the shipped defaults, then anything added from More.
 *
 * Appended rather than slotted in, because "below Expenses" is where someone
 * adding a row is told it will land — and because the stored order takes over
 * from here anyway the moment they drag it somewhere else.
 *
 * Unknown ids are dropped rather than trusted: storage outlives any given shape
 * of the catalogue.
 */
export function mainRoster(extras: string[] = []): NavItem[] {
  const defaults = NAV[0]?.items ?? [];
  const added = (extras ?? []).flatMap((id) => {
    const item = ADDITIONAL_BY_ID[id];
    return item ? [item as NavItem] : [];
  });
  return [...defaults, ...added];
}

/**
 * The nav ids an installed add-on has taken over.
 *
 * Resolved from the plan rather than stored, so it can't go stale: an add-on
 * removed from the plan stops replacing anything on the same render, and the
 * row it was standing in for comes back on its own.
 *
 * Returns ids rather than doing the filtering, because two different lists need
 * it — the MAIN section and the pins — and a function that hid rows itself
 * would only ever have hidden them in one of them.
 */
export function replacedNavIds(addedAddonIds: string[] = []): string[] {
  // Two guards, both load-bearing: the plan itself can be undefined before the
  // add-ons atom has read storage, and `replaces` is optional on an add-on —
  // most declare none at all.
  return (addedAddonIds ?? []).flatMap((id) => addonById(id)?.replaces ?? []);
}

/**
 * Routes Main already has a row for. An add-on whose page is one of these —
 * payroll, which lives in Main as a group with its own submenu — doesn't get a
 * second, flat row in the Add-ons section pointing at the same place.
 */
const MAIN_HREFS = new Set(
  (NAV[0]?.items ?? []).flatMap((item) => [
    ...(item.href ? [item.href] : []),
    ...(item.children ?? []).flatMap((child) =>
      child.href ? [child.href] : [],
    ),
  ]),
);

/** The rows the ADD-ONS section draws, in the order they're stored in. */
export function addonRows(
  addedIds: string[] = [],
  /**
   * The order the person dragged the ADD-ONS section into, if they have.
   *
   * The list itself is the subscription's — it arrives in whatever order the
   * server holds the slugs in, which nobody chose. The arrangement stays a
   * local preference stored like any other section's, so a drag here persists
   * the same way a drag in MAIN does without pretending to rewrite the plan.
   */
  order?: string[],
): NavItem[] {
  const ordered = applyOrder(
    (addedIds ?? []).map((id) => ({ id })),
    order,
  ).map((item) => item.id);

  return ordered.flatMap((id) => {
    const addon = addonById(id);
    return addon && !(addon.href && MAIN_HREFS.has(addon.href))
      ? [
          {
            id: addon.id,
            label: addon.name,
            // A group's row opens its children rather than navigating.
            href: addon.pages?.length ? undefined : addon.href,
            icon: addon.icon,
            ...(addon.pages?.length ? { children: addon.pages } : {}),
          },
        ]
      : [];
  });
}

/* ------------------------------------------------------------------ *
 * Customisation
 * ------------------------------------------------------------------ */

/**
 * How the person has arranged the rail.
 *
 * `order` is each section's items by section heading, `childOrder` is each
 * group's submenu by that group's id, and `hidden` is every id switched off at
 * either level — one flat list, because nav ids are unique across both levels
 * (the same thing `PIN_TARGETS` below relies on) and two lists would only
 * invite a child id into the wrong one.
 *
 * `extras` is the additional items added from More, which is a different kind of
 * fact from the other three: those three record how the rail was rearranged,
 * this one records what's in it to rearrange.
 *
 * `replaced` is the fifth kind: rows an installed add-on has superseded. Its
 * own field rather than more entries in `hidden`, because the two mean
 * different things and only one of them is the person's decision — folding a
 * replacement into `hidden` would leave the customise modal showing a switch
 * that had been flipped by a purchase.
 *
 * Only sections and groups actually dragged appear in the two maps, so one added
 * to NAV later arrives in its catalogue order rather than being ordered by a map
 * that has never heard of it. Ids rather than resolved items throughout, for the
 * same reason pins are ids: storage outlives any given shape of the nav.
 */
export type SidebarLayout = {
  order?: Record<string, string[]>;
  childOrder?: Record<string, string[]>;
  hidden?: string[];
  extras?: string[];
  replaced?: string[];
  /**
   * The pinned ids, which leave the section they came from — a pin moves a row
   * up to PINNED rather than copying it. Separate from `hidden` because the two
   * empty a group for opposite reasons, and `visibleNav` answers them
   * differently; see its doc.
   */
  pinned?: string[];
};

/**
 * Anything id-keyed in the person's order.
 *
 * Stored order first, then anything it doesn't mention. That second half is the
 * point: a nav item shipped after someone last dragged their sidebar isn't in
 * their stored order, and an implementation that only rendered what the order
 * named would hide every new item from exactly the people who customise.
 *
 * Generic over the two levels because the rule is the same for both — a section's
 * items and a group's children are the same problem at different depths, and
 * writing it twice is how the two would drift.
 */
function applyOrder<T extends { id: string }>(
  items: T[],
  order?: string[],
): T[] {
  if (!order?.length) return items;

  const remaining = new Map(items.map((item) => [item.id, item]));
  const ordered = order.flatMap((id) => {
    const item = remaining.get(id);
    if (!item) return [];
    remaining.delete(id);
    return [item];
  });

  // Appended rather than slotted back into their catalogue positions: the end of
  // its own list is somewhere a new row can be found, and reconciling two
  // orderings would be guessing at an intent nobody has expressed yet.
  return [...ordered, ...remaining.values()];
}

/** Every group in the product, by id — including the ones More holds. */
const NAV_GROUPS: Record<string, NavItem> = Object.fromEntries(
  [...mainRoster(ADDITIONAL_NAV.map((item) => item.id))]
    .filter((item) => item.children?.length)
    .map((item): [string, NavItem] => [item.id, item]),
);

/**
 * Every section's items and every group's children in the person's order,
 * switched-off ones included — which is what the customise modal lists, because
 * a row you can't see is exactly the row you've come there to switch back on.
 *
 * Scoped to Main. The ADD-ONS section isn't here because it isn't arranged the
 * same way: what's in it is what's on the plan, its order is the plan's order,
 * and the way something leaves it is to stop paying for it in More. A switch in
 * here that hid a row someone is billed for would be the one control in the
 * modal that loses them money.
 */
export function orderedNav(
  order: Record<string, string[]> = {},
  childOrder: Record<string, string[]> = {},
  extras: string[] = [],
): NavSection[] {
  // Defaults rather than required params: a stored map from before a key
  // existed arrives undefined, and JS default parameters catch exactly that.
  return [
    {
      section: MAIN_SECTION,
      items: applyOrder(mainRoster(extras), order?.[MAIN_SECTION]).map(
        (item) =>
          item.children?.length
            ? {
                ...item,
                children: applyOrder(item.children, childOrder[item.id]),
              }
            : item,
      ),
    },
  ];
}

/**
 * The rail as the person has arranged it: their order at both levels, minus what
 * they've switched off, minus what they've pinned, minus any heading left with
 * nothing under it — an empty section label is a promise of rows that aren't
 * coming.
 *
 * A pin is a move, not a copy. The row goes up to PINNED and leaves the section
 * it came from, because a shortcut that leaves the original in place isn't a
 * shortcut — it's the same row twice, and a rail that lists Invoices under Sales
 * *and* at the top is longer than the one it was meant to shorten.
 *
 * ── The two ways a group empties ────────────────────────────────────────────
 *
 * They look identical and mean opposite things, so they get opposite answers.
 *
 * Every child switched off: the group survives as an inert row. Its own switch
 * is still on, so taking it away would be answering a question about its
 * children by hiding the parent — and a childless group is the honest picture of
 * what was asked for. The customise modal warns about it rather than
 * second-guessing it.
 *
 * Every child pinned: the group goes. Nothing was switched off, so there's no
 * preference to honour — the contents moved upstairs, and leaving behind a
 * chevron that opens onto nothing would read as a broken row rather than an
 * intentional one. It comes back the moment anything is unpinned.
 *
 * Mixed — some pinned, the rest switched off — counts as the first: the person
 * did switch something off, and that's the statement worth keeping on screen.
 */
export function visibleNav(layout: SidebarLayout): NavSection[] {
  // One set, because the rail's question is only ever "does this row draw" —
  // the difference between switched off and superseded matters to the modal
  // that explains it, not to the list that omits it.
  //
  // Every field is defaulted on the way in. Four of the five come from
  // localStorage, which means they come from whatever was written there by
  // whichever version of this code last ran — a field added after someone's
  // last visit arrives undefined, and spreading undefined throws rather than
  // degrading. An absent list means an empty one in every case here, so the
  // rail draws its defaults instead of failing to draw at all.
  const hidden = new Set([
    ...(layout.hidden ?? []),
    ...(layout.replaced ?? []),
  ]);
  const pinned = new Set(layout.pinned ?? []);

  return orderedNav(layout.order, layout.childOrder, layout.extras)
    .map((section) => ({
      section: section.section,
      items: section.items
        .filter((item) => !hidden.has(item.id) && !pinned.has(item.id))
        /*
         * The group that has nothing left because all of it was pinned.
         *
         * Judged against the children this group STARTED with, before either
         * filter ran — a child that is merely switched off is still one this
         * group has, and asking the already-filtered list would drop the inert
         * row that the switched-off case is meant to keep.
         */
        .filter(
          (item) =>
            !item.children?.length ||
            item.children.some((child) => !pinned.has(child.id)),
        )
        .map((item) =>
          item.children
            ? {
                ...item,
                children: item.children.filter(
                  (child) => !hidden.has(child.id) && !pinned.has(child.id),
                ),
              }
            : item,
        ),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * The ids a drag rearranges: one section's current order, resolved against the
 * catalogue so the first drag in a section has a full list to reorder rather
 * than the empty one storage holds until then.
 */
export function sectionOrder(
  sectionName: string,
  order: Record<string, string[]> = {},
  extras: string[] = [],
): string[] {
  if (sectionName !== MAIN_SECTION) return [];
  return applyOrder(mainRoster(extras), order?.[sectionName]).map(
    (item) => item.id,
  );
}

/** The same, one level down: a group's children in the person's order. */
export function childrenOrder(
  groupId: string,
  childOrder: Record<string, string[]> = {},
): string[] {
  const children = NAV_GROUPS[groupId]?.children;
  if (!children) return [];
  return applyOrder(children, childOrder?.[groupId]).map((child) => child.id);
}

/* ------------------------------------------------------------------ *
 * Pins, routes and search
 * ------------------------------------------------------------------ */

/** Every row the product has, wherever it currently lives. */
const ALL_ITEMS: NavItem[] = mainRoster(ADDITIONAL_NAV.map((item) => item.id));

/**
 * Every row that can be pinned, keyed by id: the children of a group, and the
 * top-level rows that have no children of their own.
 *
 * A group row is not one of them. It goes nowhere — its only job is to open the
 * list underneath it — so a shortcut to it saves nobody a step: you still land
 * on the rail and still pick a tab. Pinning one used to copy the whole group,
 * submenu and all, which put a second collapsible at the top of a section whose
 * whole purpose was to be the short list. The thing worth a shortcut is the
 * screen, and the screens are the leaves.
 *
 * `Assets` and `Migrations` keep theirs: they're top-level rows without
 * children, which makes them leaves that happen to sit at depth zero. The rule
 * is about having somewhere to go, not about depth.
 *
 * A child takes its parent's icon and tone. Children carry none of their own,
 * and a pinned row without an icon would sit a label's width out of line with
 * its neighbours.
 *
 * Add-ons aren't in here. They have a section of their own now, and a pin that
 * put a second copy of a row in PINNED would make adding an add-on look like it
 * had landed in two places.
 */
const PIN_TARGETS: Record<string, NavItem> = Object.fromEntries(
  ALL_ITEMS.flatMap((item): [string, NavItem][] => [
    ...(item.children?.length
      ? []
      : ([[item.id, item]] as [string, NavItem][])),
    ...(item.children ?? []).map((child): [string, NavItem] => [
      child.id,
      { ...child, icon: item.icon, tone: item.tone },
    ]),
  ]),
);

/**
 * Whether this row is something a pin could point at.
 *
 * Exported so the rail can ask the same question `PIN_TARGETS` was built from,
 * rather than re-deriving it from `hasChildren` and drifting the day a group
 * gains an href of its own.
 */
export function isPinnable(id: string): boolean {
  return id in PIN_TARGETS;
}

/**
 * Stored ids resolved to what the PINNED section renders, in the order they were
 * pinned. Ids that no longer name anything are dropped rather than trusted —
 * storage outlives any given shape of the nav, and that now includes anyone who
 * pinned a group back when groups were pinnable: the id resolves to nothing and
 * falls out of PINNED on the next load, which is the same path a removed row
 * takes and needs no migration of its own.
 *
 * A pin is a copy, not a move: the row stays where it lives as well, so muscle
 * memory for "Invoices is under Sales" keeps working after someone pins it, and
 * unpinning takes the shortcut away rather than appearing to relocate the thing
 * itself. Children come along whole for the same reason.
 */
export function pinTargets(ids: string[] = []): NavItem[] {
  return (ids ?? []).flatMap((id) => {
    const target = PIN_TARGETS[id];
    return target ? [target] : [];
  });
}

/** Whether the route belongs to a row in these sections, at either level. */
export function sectionsCoverPath(
  sections: NavSection[],
  pathname: string,
): boolean {
  return sections.some((section) =>
    section.items.some(
      (item) =>
        (item.href && isActivePath(pathname, item.href)) ||
        (item.children ?? []).some(
          (child) => child.href && isActivePath(pathname, child.href),
        ),
    ),
  );
}

/** Group id that owns the given pathname, so its children start expanded. */
export function findOpenGroup(pathname: string): string | null {
  for (const item of ALL_ITEMS) {
    if (item.children?.some((c) => c.href && isActivePath(pathname, c.href))) {
      return item.id;
    }
  }
  return null;
}

/**
 * Every href the product routes to, so activeness can be judged against its
 * siblings. Add-ons and the two fixtures are in here as well: an add-on's row
 * has to light up on its own page like any other, and the Dashboard's href is
 * what stops it staying lit on every route beneath it.
 */
const NAV_HREFS: string[] = [
  QUICK_ACTIONS_NAV.href,
  DASHBOARD_NAV.href,
  RESOURCES_HREF,
  ...ALL_ITEMS.flatMap((item) => [
    ...(item.href ? [item.href] : []),
    ...(item.children ?? []).flatMap((child) =>
      child.href ? [child.href] : [],
    ),
  ]),
  // An add-on's own pages too: /projects/settings must light up Project
  // Settings alone, not Projects as well.
  ...ADDONS.flatMap((addon) => [
    ...(addon.href ? [addon.href] : []),
    ...(addon.pages ?? []).map((page) => page.href),
  ]),
];

/** Whether the route is this href or something beneath it. */
function covers(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Longest prefix wins.
 *
 * Prefix matching alone lit up two rows at once wherever a parent route shares a
 * prefix with a child's — /expenses/business-planner satisfied /expenses too.
 * Exact matching alone would be wrong the other way: /invoices/inv-0022 has no
 * nav item of its own and should still light up Invoices.
 *
 * So an item is active when it covers the route and no other nav item covers it
 * more specifically. That also retires the special case /transactions carried to
 * stop Matching Rules lighting up All transactions — the general rule handles it.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (!covers(pathname, href)) return false;
  return !NAV_HREFS.some(
    (other) => other.length > href.length && covers(pathname, other),
  );
}

export type SearchTarget = {
  label: string;
  href?: string;
  parent?: string;
};

/**
 * Flattened nav plus the extra command-palette destinations from the spec.
 *
 * Walks everything, not just what's in the rail. A destination someone hasn't
 * added to their sidebar is still somewhere they can go, and a palette that only
 * offered the three default rows would be the narrowest search in the product.
 */
export function searchTargets(): SearchTarget[] {
  const out: SearchTarget[] = [];
  for (const item of ALL_ITEMS) {
    if (item.href || !item.children) {
      out.push({ label: item.label, href: item.href });
    }
    for (const child of item.children ?? []) {
      out.push({ label: child.label, href: child.href, parent: item.label });
    }
  }
  out.push({ label: QUICK_ACTIONS_NAV.label, href: QUICK_ACTIONS_NAV.href });
  out.push({ label: DASHBOARD_NAV.label, href: DASHBOARD_NAV.href });

  // The hub, and the things in it. Leaving them out would make "tax
  // estimator" — a phrase people do type — stop finding anything.
  out.push({ label: "Widgets & Resources", href: RESOURCES_HREF });
  // App routes only; the rest are marketing-site pages and open off-site.
  // Tax estimator is a nav row too now; list each destination once.
  const navHrefs = new Set(out.map((target) => target.href));
  for (const item of ALL_WIDGETS) {
    if (item.href.startsWith("/") && !navHrefs.has(item.href)) {
      out.push({ label: item.title, href: item.href, parent: "Resources" });
    }
  }

  // Add-ons with a page of their own, which NAV doesn't hold. Skipped where a
  // main row already goes there (payroll, the asset register), so a search
  // doesn't list the same destination twice.
  const listed = new Set(out.map((target) => target.href));
  for (const addon of ADDONS) {
    if (addon.href && !listed.has(addon.href)) {
      out.push({ label: addon.name, href: addon.href, parent: "Add-ons" });
      listed.add(addon.href);
    }
    // Its pages by their own names — "calendar", "planner" — under the add-on.
    for (const page of addon.pages ?? []) {
      out.push({ label: page.label, href: page.href, parent: addon.name });
    }
  }

  out.push({ label: "Create invoice", href: "/invoices/new" });
  out.push({ label: "Create proposal", href: "/proposals/new" });
  out.push({ label: "View plans & subscription", href: "/settings" });
  return out;
}

/* ------------------------------------------------------------------ *
 * Country wording
 * ------------------------------------------------------------------ */

/**
 * Rows whose label names something a government defines, and the word each
 * country uses for it.
 *
 * Only the tax return is in here. "Profit & loss" and "Balance sheet" are
 * accounting, not jurisdiction — they are the same words in every market — and
 * routing them through the registry would add a lookup to a string that will
 * never change. See sole-ocr's `docs/MULTI_COUNTRY_REPORTING.md` §6 for the
 * test: would an accountant in another country call this something else?
 *
 * The **id never changes**. Pins, hidden rows and section order are all keyed
 * by it and live in the user's own storage, so a row that renamed its id when
 * a business moved country would silently lose all three.
 */
const JURISDICTION_LABELS: Record<string, (words: CountryWords) => string> = {
  bas: (words) => `${words.taxReturn} report`,
};

/** The words the nav needs from the business's country. */
export type CountryWords = {
  /** "BAS", "GST return", "VAT return". */
  taxReturn: string;
};

/** Australia, for the moment before the country context has answered. */
export const AU_NAV_WORDS: CountryWords = { taxReturn: "BAS" };

/**
 * The same sections, named the way this business's country names them.
 *
 * Applied at render rather than baked into `NAV`, because `NAV` is a module
 * constant shared by every business in the tab and the label is per-business.
 */
export function localiseNav(
  sections: NavSection[],
  words: CountryWords = AU_NAV_WORDS,
): NavSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      label: JURISDICTION_LABELS[item.id]?.(words) ?? item.label,
      children: item.children?.map((child) => ({
        ...child,
        label: JURISDICTION_LABELS[child.id]?.(words) ?? child.label,
      })),
    })),
  }));
}

/** One row's label, for the places that render a row outside a section. */
export function localiseNavLabel(
  id: string,
  label: string,
  words: CountryWords = AU_NAV_WORDS,
): string {
  return JURISDICTION_LABELS[id]?.(words) ?? label;
}
