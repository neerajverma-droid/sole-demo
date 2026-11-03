import {
  ArrowRightLeft,
  BarChart3,
  Building2,
  Calendar,
  Clock,
  CreditCard,
  FolderKanban,
  type LucideIcon,
  MapPin,
  Megaphone,
  Package,
  PiggyBank,
  Star,
  Target,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";

import { NDIS_INDUSTRY } from "@/lib/settings";

/**
 * The workspace checklist — what the last step of setup offers to put in the
 * rail.
 *
 * The rail ships with four rows and everything else behind More, which is right
 * for someone who has been using Sole for a month and wrong for someone on
 * their first day: they don't yet know More exists. This step is the one chance
 * to ask directly, so the catalogue is deliberately wider than the rail's own
 * defaults.
 *
 * The awkward part, stated plainly: the things on this list live in four
 * different places in the product. Some are nav items More holds back, some are
 * paid add-ons, some are tabs inside a group, and two don't exist yet. Rather
 * than pretend they're one kind of thing, every tool declares where it goes and
 * `applyTools` does what each kind needs — so a checkbox can't quietly tick
 * something with nowhere to land.
 */

/**
 * Where a checked tool ends up.
 *
 * - `nav` — an id from `ADDITIONAL_NAV`. Goes into the MAIN section, which is
 *   what the brief asks for and the only kind that can honour it literally.
 * - `addon` — an id from the add-ons catalogue. Adding it puts a row in the
 *   ADD-ONS section, because that's where a paid tool lives; putting it in MAIN
 *   would hide the fact that it's billed.
 * - `pin` — a tab inside a group that's already in the rail. It gets a pin,
 *   which is the product's existing way of lifting one row to the top.
 * - `none` — nothing to point at yet. Still offered, because the question
 *   "would you use this" is worth asking before the thing is built.
 */
export type ToolTarget =
  | { kind: "nav"; ids: string[] }
  | { kind: "addon"; ids: string[] }
  | { kind: "pin"; ids: string[] }
  | { kind: "none" };

export type ToolGroup = "additional" | "finance" | "operations" | "growth";

export type WorkspaceTool = {
  id: string;
  name: string;
  description: string;
  group: ToolGroup;
  target: ToolTarget;
  /**
   * Drawn on the recommendation cards, which are the only place a tool is
   * shown large enough to want one. The rows in More Tools stay text — sixteen
   * icons down a collapsed list is decoration, not navigation.
   */
  icon: LucideIcon;
};

export const TOOL_GROUP_LABEL: Record<ToolGroup, string> = {
  additional: "Additional",
  finance: "Finance add-ons",
  operations: "Operations add-ons",
  growth: "Growth",
};

export const TOOL_GROUPS: ToolGroup[] = [
  "additional",
  "finance",
  "operations",
  "growth",
];

/** The rows that are always in the rail, and can't be switched off here. */
export const CORE_TOOLS = [
  "Dashboard",
  "Transactions",
  "Sales",
  "Expenses",
  "Assets",
] as const;

export const WORKSPACE_TOOLS: WorkspaceTool[] = [
  {
    id: "contacts",
    icon: Users,
    name: "Contacts",
    description: "Manage clients and suppliers",
    group: "additional",
    target: { kind: "nav", ids: ["contacts"] },
  },
  {
    id: "reporting",
    icon: BarChart3,
    name: "Reporting Suite",
    description: "P&L, BAS, and tax reports",
    group: "additional",
    target: { kind: "nav", ids: ["reporting"] },
  },
  {
    id: "liabilities",
    icon: Wallet,
    name: "Liabilities & Equity",
    description: "Track loans, credit cards, owner equity",
    group: "additional",
    target: { kind: "nav", ids: ["liabilities"] },
  },
  {
    id: "assets",
    icon: Package,
    name: "Assets",
    description: "Track business assets and depreciation",
    group: "additional",
    target: { kind: "addon", ids: ["assets"] },
  },
  {
    id: "migrations",
    icon: ArrowRightLeft,
    name: "Migrations",
    description: "Import from Xero, MYOB, QuickBooks",
    group: "additional",
    target: { kind: "nav", ids: ["migrations"] },
  },

  {
    id: "payments",
    icon: CreditCard,
    name: "Payments",
    description: "Accept online payments via Stripe, PayPal",
    group: "finance",
    target: { kind: "pin", ids: ["payments"] },
  },
  {
    id: "super",
    icon: PiggyBank,
    name: "Super Contributions",
    description: "Manage personal super",
    group: "finance",
    target: { kind: "pin", ids: ["super"] },
  },
  {
    id: "refunds",
    icon: Undo2,
    name: "Client & Vendor Refunds",
    description: "Handle refunds cleanly",
    group: "finance",
    // One row on the checklist, two tabs in the product — they're the same job
    // from either side of an invoice, and asking twice would be pedantry.
    target: { kind: "pin", ids: ["client-refund", "vendor-refund"] },
  },

  {
    id: "planner",
    icon: Target,
    name: "Business Planner",
    description: "Set and track business goals",
    group: "operations",
    target: { kind: "pin", ids: ["planner"] },
  },
  {
    id: "projects",
    icon: FolderKanban,
    name: "Projects / Milestones",
    description: "Manage client work",
    group: "operations",
    target: { kind: "addon", ids: ["projects"] },
  },
  {
    id: "scheduling",
    icon: Calendar,
    name: "Scheduling",
    description: "Calendar and appointments",
    group: "operations",
    target: { kind: "addon", ids: ["scheduling"] },
  },
  {
    id: "time-tracker",
    icon: Clock,
    name: "Time Tracker",
    description: "Log billable hours",
    group: "operations",
    target: { kind: "addon", ids: ["time-tracker"] },
  },
  {
    id: "km-tracker",
    icon: MapPin,
    name: "KM Tracker",
    description: "Log business travel",
    group: "operations",
    target: { kind: "addon", ids: ["km-tracker"] },
  },
  {
    id: "investment",
    icon: Building2,
    name: "Investment Property",
    description: "Track rental income and expenses",
    group: "operations",
    target: { kind: "addon", ids: ["investment"] },
  },

  // TODO: growth doesn't exist in the product yet. It's on the list because
  // what people tick here is the cheapest signal we'll ever get about what to
  // build next — but ticking it adds nothing to the rail, and the step's
  // summary says so rather than claiming otherwise.
  {
    id: "growth",
    icon: Megaphone,
    name: "Growth & Marketing",
    description: "Marketing tools and templates",
    group: "growth",
    target: { kind: "none" },
  },
  {
    id: "reputation",
    icon: Star,
    name: "Reputation",
    description: "Reviews and testimonials",
    group: "growth",
    target: { kind: "nav", ids: ["reputation"] },
  },
];

const BY_ID: Record<string, WorkspaceTool> = Object.fromEntries(
  WORKSPACE_TOOLS.map((tool): [string, WorkspaceTool] => [tool.id, tool]),
);

export function toolById(id: string): WorkspaceTool | undefined {
  return BY_ID[id];
}

/* ------------------------------------------------------------------ *
 * Recommendations
 * ------------------------------------------------------------------ */

/**
 * TODO: STUB — the industry mapping needs defining properly with the product
 * team, per industry, against what those businesses actually use. What's below
 * is four plausible guesses so the UI has something to render; it is not a
 * researched mapping and shouldn't be treated as one.
 *
 * Keyed off `INDUSTRIES` — the list Settings and the invoice chooser already
 * read — rather than a second vocabulary of industry names. A mapping keyed off
 * labels this form invented would stop matching the moment someone changed
 * their industry in Settings.
 */
const INDUSTRY_RECOMMENDATIONS: Record<string, string[]> = {
  Construction: ["km-tracker", "scheduling"],
  Consulting: ["time-tracker", "projects"],
  [NDIS_INDUSTRY]: ["contacts", "reporting"],
  "Personal Trainers / Fitness": ["scheduling", "payments"],
  Creatives: ["projects", "time-tracker"],
  "Food services": ["payments", "scheduling"],
};

/**
 * What's offered when we don't know the industry, or don't have a mapping for
 * it yet.
 *
 * Three things almost everyone ends up wanting, rather than nothing: an empty
 * Recommended heading would be the one section on the step that taught the
 * reader we hadn't thought about them.
 */
export const DEFAULT_RECOMMENDED = ["contacts", "reporting", "payments"];

/**
 * TODO: STUB — the "Why" line on each recommendation card.
 *
 * These are verb phrases completing "most {industry} users …", written here to
 * give the cards something true-sounding to show. The real copy needs writing
 * per industry × tool, because the honest reason a plumber wants the KM tracker
 * isn't the reason a bookkeeper does — and a line that reads as generated is
 * worse than no line, since the whole point of it is to sound like we know
 * something about their trade.
 */
const WHY_REASON: Record<string, string> = {
  contacts: "keep client details in one place instead of in their phone",
  reporting: "want a P&L in front of them before their first BAS",
  liabilities: "have a loan or a card the books need to know about",
  assets: "buy gear worth depreciating in their first year",
  migrations: "arrive with a year of history somewhere else",
  payments: "get paid faster with a pay button on the invoice",
  super: "put money into super themselves rather than through an employer",
  refunds: "issue a credit sooner or later and want it recorded properly",
  planner: "set a revenue target and check it monthly",
  projects: "run client work in stages rather than one lump",
  scheduling: "book clients and invoice them from the same place",
  "time-tracker": "bill by the hour and reconstruct the week from memory",
  "km-tracker": "log jobs on the road",
  investment: "hold a property alongside the business",
  growth: "want more of the work they already do",
  reputation: "win work on a recommendation",
};

/**
 * The line under a recommendation, or nothing if there isn't one to give.
 *
 * Names the industry when we have it and falls back to "sole traders" when we
 * don't — "most users" is a sentence that could be printed in any product and
 * so persuades nobody.
 */
export function whyRecommended(
  toolId: string,
  industry: string,
): string | undefined {
  const reason = WHY_REASON[toolId];
  if (!reason) return undefined;
  const who = industry.trim() ? `most ${industry} users` : "most sole traders";
  return `Why: ${who} ${reason}`;
}

/** The recommended ids for an industry, in catalogue order. */
export function recommendedFor(industry: string): string[] {
  const ids = INDUSTRY_RECOMMENDATIONS[industry] ?? DEFAULT_RECOMMENDED;
  // Ordered by the catalogue rather than by the mapping, so two industries that
  // recommend the same pair list them the same way round.
  return WORKSPACE_TOOLS.filter((tool) => ids.includes(tool.id)).map(
    (tool) => tool.id,
  );
}

/**
 * The tools from a list that can actually be put in the rail.
 *
 * Add-ons are filtered out, and that's a deliberate gap rather than an
 * oversight: they're billed, and switching a paid tool on because someone said
 * they were a consultant would be a charge nobody agreed to. They stay in the
 * marketplace, where the price is next to them.
 */
export function placeableTools(ids: string[]): string[] {
  return ids.filter((id) => {
    const kind = toolById(id)?.target.kind;
    return kind === "nav" || kind === "pin";
  });
}

/**
 * What an industry actually gets in its sidebar.
 *
 * The industry's own picks where any of them can be placed, and the platform
 * default where none can — several industries are recommended two paid add-ons
 * and nothing else, and leaving those accounts with an untouched rail would be
 * the one case where answering the questions changed nothing visible.
 *
 * One definition, because three surfaces read it and they have to agree: the
 * step that applies it, the card that names it, and the customise dialog that
 * groups by it. Two of them disagreeing would mean a "Recommended" band that
 * didn't match what was recommended.
 */
export function sidebarDefaultsFor(industry: string): string[] {
  const picks = placeableTools(recommendedFor(industry));
  return picks.length > 0 ? picks : placeableTools(DEFAULT_RECOMMENDED);
}

/**
 * The rest of the catalogue, grouped — with anything already recommended taken
 * out, because a tool offered twice is a checkbox that disagrees with itself.
 */
export function remainingGroups(
  recommended: string[],
): { group: ToolGroup; tools: WorkspaceTool[] }[] {
  const shown = new Set(recommended);
  return TOOL_GROUPS.map((group) => ({
    group,
    tools: WORKSPACE_TOOLS.filter(
      (tool) => tool.group === group && !shown.has(tool.id),
    ),
  })).filter((entry) => entry.tools.length > 0);
}

/**
 * The checked tools, split by where each one has to be written.
 *
 * Returns ids rather than performing the writes, so the atoms stay in the
 * component that owns them and this module stays testable arithmetic over a
 * list. `unplaced` is the honest remainder — what was ticked with nowhere yet
 * to put it.
 */
export function applyTools(selected: string[]): {
  nav: string[];
  addons: string[];
  pins: string[];
  unplaced: string[];
} {
  const nav: string[] = [];
  const addons: string[] = [];
  const pins: string[] = [];
  const unplaced: string[] = [];

  // Catalogue order, not click order: the brief asks for them appended "in the
  // order they appear on the checklist", and the order someone happened to tick
  // boxes in isn't a preference about anything.
  for (const tool of WORKSPACE_TOOLS) {
    if (!selected.includes(tool.id)) continue;
    switch (tool.target.kind) {
      case "nav":
        nav.push(...tool.target.ids);
        break;
      case "addon":
        addons.push(...tool.target.ids);
        break;
      case "pin":
        pins.push(...tool.target.ids);
        break;
      case "none":
        unplaced.push(tool.id);
        break;
    }
  }

  return { nav, addons, pins, unplaced };
}
