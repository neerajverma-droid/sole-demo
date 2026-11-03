"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export const INVESTMENT_ROOT = "/investment-property";
export const PROPERTIES_ROOT = "/investment-property/properties";

const TABS = [
  { href: INVESTMENT_ROOT, label: "Property portfolio" },
  { href: PROPERTIES_ROOT, label: "All properties" },
] as const;

export function InvestmentNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Investment property" className="flex gap-6 border-b border-border">
      {TABS.map((tab) => {
        const active =
          tab.href === INVESTMENT_ROOT
            ? pathname === INVESTMENT_ROOT
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-0.5 pb-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const PROPERTY_TABS = [
  { key: "overview", label: "Overview" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "loan", label: "Loan" },
  { key: "maintenance", label: "Maintenance" },
  { key: "rental-schedule", label: "Rental schedule" },
  { key: "cost-base", label: "Cost base" },
  { key: "documents", label: "Documents" },
  { key: "use-history", label: "Use history" },
  { key: "cgt", label: "CGT" },
] as const;

export type PropertyTabKey = (typeof PROPERTY_TABS)[number]["key"];

export function parseTab(value: string | null | undefined): PropertyTabKey {
  return PROPERTY_TABS.find((tab) => tab.key === value)?.key ?? "overview";
}

export function propertyTabHref(propertyId: string, tab: PropertyTabKey): string {
  const base = `${PROPERTIES_ROOT}/${propertyId}`;
  return tab === "overview" ? base : `${base}?tab=${tab}`;
}

export function PropertyTabs({ propertyId, active }: { propertyId: string; active: PropertyTabKey }) {
  return (
    <nav
      aria-label="Property sections"
      className="-mb-2 flex gap-6 overflow-x-auto border-b border-border"
    >
      {PROPERTY_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={propertyTabHref(propertyId, tab.key)}
          scroll={false}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-0.5 pb-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            tab.key === active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
