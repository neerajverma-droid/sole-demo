import {
  Banknote,
  Building2,
  Gauge,
  Globe2,
  ListTree,
  HeartPulse,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  Map,
  Radar,
  Rocket,
  Route,
  Share2,
  Target,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  ADMIN_BASE,
  COMMAND_CENTRE_DASHBOARDS,
  COMMAND_CENTRE_FEATURE_KEYS,
  canPass,
  dashboardGate,
  type AdminAccess,
  type AdminGate,
} from "@/lib/admin/access";

/**
 * The admin sidebar, as data.
 *
 * Separate from `lib/nav.ts` rather than a section of it: the product rail's
 * pins, ordering and "More" catalogue all assume every row is something a
 * business owner can customise, and none of that applies here. The shape
 * mirrors `NavItem` so the two read alike.
 */
export type AdminNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** One line under the page title while the screen is still a stub. */
  description: string;
  gate: AdminGate;
};

export type AdminNavSection = {
  section: string;
  items: AdminNavItem[];
};

const DASHBOARD_ICONS: Record<string, LucideIcon> = {
  "customer-health": HeartPulse,
  "trial-activation": Rocket,
  "product-activation": Zap,
  growth: TrendingUp,
  "customer-journey": Route,
  support: LifeBuoy,
  investor: Landmark,
  cockpit: Gauge,
  leadgen: Target,
  social: Share2,
  roadmap: Map,
  cash: Banknote,
};

const DASHBOARD_DESCRIPTIONS: Record<string, string> = {
  "customer-health": "Health, maturity and pulse scores for every paying, free and trial business.",
  "trial-activation": "How trials activate and convert, by cohort, segment and event.",
  "product-activation": "Onboarding funnels, return visits and early invoicing.",
  growth: "The whole journey from sign-up to churn, with unit economics.",
  "customer-journey": "Acquire, activate, convert, engage and retain, against SaaS benchmarks.",
  support: "Ticket flow, product areas and customer risk from the Jira export.",
  investor: "Growth, usage, monetisation and capital for investor reporting.",
  cockpit: "Small business, SPM, social and CRM in one operating view.",
  leadgen: "Lead sources, the partner campaign funnel and landing-page offers.",
  social: "Instagram, Facebook and YouTube reach and engagement.",
  roadmap: "Roadmap items, usage, market and insights.",
  cash: "Cash position, burn, runway and budget variance from the bank export.",
};

export const ADMIN_NAV: AdminNavSection[] = [
  {
    section: "Platform",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: `${ADMIN_BASE}/dashboard`,
        icon: LayoutDashboard,
        description: "Tenants, users and recent sign-ups across the platform.",
        gate: { feature: "dashboard" },
      },
      {
        id: "tenants",
        label: "Tenants",
        href: `${ADMIN_BASE}/tenants`,
        icon: Building2,
        description: "Every tenant workspace, its members, branding and subscriptions.",
        gate: { feature: "tenants" },
      },
      {
        id: "users",
        label: "Users",
        href: `${ADMIN_BASE}/users`,
        icon: Users,
        description: "Every account on the platform, with export, impersonation and deletion.",
        gate: { feature: "users" },
      },
      {
        id: "countries",
        label: "Countries",
        href: `${ADMIN_BASE}/countries`,
        icon: Globe2,
        description: "Tax rates, thresholds, filing rules and labels for every country Sole operates in.",
        gate: { feature: "country_config" },
      },
      {
        id: "chart-of-accounts",
        label: "Chart of accounts",
        href: `${ADMIN_BASE}/chart-of-accounts`,
        icon: ListTree,
        description: "The shared account catalogue — what each country calls an account, and where it's offered.",
        gate: { feature: "country_config" },
      },
    ],
  },
  {
    section: "Command Centre",
    items: [
      {
        id: "command-centre",
        label: "All dashboards",
        href: `${ADMIN_BASE}/command-centre`,
        icon: Radar,
        description: "Every Command Centre dashboard you have access to.",
        gate: { anyOf: COMMAND_CENTRE_FEATURE_KEYS },
      },
      ...COMMAND_CENTRE_DASHBOARDS.map((dashboard) => ({
        id: `cc-${dashboard.slug}`,
        label: dashboard.label,
        href: `${ADMIN_BASE}/command-centre/${dashboard.slug}`,
        icon: DASHBOARD_ICONS[dashboard.slug] ?? Radar,
        description: DASHBOARD_DESCRIPTIONS[dashboard.slug] ?? "",
        gate: dashboardGate(dashboard),
      })),
    ],
  },
  {
    section: "Administration",
    items: [
      {
        id: "access",
        label: "Admin access",
        href: `${ADMIN_BASE}/access`,
        icon: KeyRound,
        description: "Create admin accounts and choose which sections each one can open.",
        gate: { superAdminOnly: true },
      },
    ],
  },
];

/**
 * The sidebar this user gets: rows they can't open are left out, and a section
 * left with nothing is dropped with them.
 *
 * Hidden rather than disabled, unlike row actions elsewhere in the app. A
 * delegated admin's grants are the whole of their job here, and a rail full of
 * greyed-out dashboards would mostly be a list of things they weren't given.
 */
export function visibleAdminNav(access: AdminAccess): AdminNavSection[] {
  return ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => canPass(item.gate, access)),
  })).filter((section) => section.items.length > 0);
}

export function findAdminNavItem(id: string): AdminNavItem | undefined {
  return ADMIN_NAV.flatMap((section) => section.items).find((item) => item.id === id);
}

/** The row a path belongs to: the longest href that contains it wins. */
export function activeAdminNavId(
  pathname: string,
  sections: AdminNavSection[],
): string | null {
  const match = sections
    .flatMap((section) => section.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.id ?? null;
}
