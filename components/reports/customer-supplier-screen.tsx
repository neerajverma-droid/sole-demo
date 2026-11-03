"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { Boxes, DollarSign, ReceiptText, Users, type LucideIcon } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TabularReportScreen } from "@/components/reports/tabular-report-screen";
import { custSupplierPeriodAtom, custSupplierRangeAtom } from "@/lib/atoms";
import {
  CUSTOMER_SUPPLIER_TABS,
  RECORD_TYPE_OF,
  customerSupplierConfig,
  type CustomerSupplierTab,
} from "@/lib/report-configs";

/**
 * Per-tab empty state — icon and "go add one" link match the module each tab
 * is drawn from (the same icons `lib/nav.ts` uses for Contacts, Sales and
 * Expenses), not a generic report icon.
 */
const EMPTY_COPY: Record<
  CustomerSupplierTab,
  {
    icon: LucideIcon;
    title: string;
    description: string;
    action: { label: string; href: string };
  }
> = {
  Contacts: {
    icon: Users,
    title: "No contacts yet",
    description: "Clients and suppliers you add will be listed here with their details.",
    action: { label: "Go to Contacts", href: "/contacts" },
  },
  Invoices: {
    icon: ReceiptText,
    title: "No invoices in this period",
    description: "Invoices raised against a contact between the two dates will appear here.",
    action: { label: "Go to Invoices", href: "/invoices" },
  },
  Quotes: {
    icon: ReceiptText,
    title: "No quotes in this period",
    description: "Quotes sent to a contact between the two dates will appear here.",
    action: { label: "Go to Quotes", href: "/quotes" },
  },
  Expenses: {
    icon: DollarSign,
    title: "No expenses in this period",
    description: "Expenses recorded against a supplier between the two dates will appear here.",
    action: { label: "Go to Expenses", href: "/expenses" },
  },
  Assets: {
    icon: Boxes,
    title: "No assets in this period",
    description: "Assets bought from a supplier between the two dates will appear here.",
    action: { label: "Go to Assets", href: "/assets" },
  },
};

/**
 * Customer / Supplier report.
 *
 * One contact list and four ledgers against it, as five tabs. The tab is a
 * server-side filter (`recordType`), not a client-side one — the backend
 * paginates only when it's told which of the five to return, so the tab has to
 * go up with the request rather than being applied to a page already fetched.
 *
 * Each tab is a different set of columns, so each is its own config; the shared
 * screen redraws around it.
 */
export function CustomerSupplierScreen() {
  const [period, setPeriod] = useAtom(custSupplierPeriodAtom);
  const [range, setRange] = useAtom(custSupplierRangeAtom);
  const [tab, setTab] = React.useState<CustomerSupplierTab>("Contacts");

  // A config per tab, memoised so switching back to a tab reuses its query key
  // rather than looking like a new report each time.
  const config = React.useMemo(() => customerSupplierConfig(tab), [tab]);
  const extra = React.useMemo(() => ({ recordType: RECORD_TYPE_OF[tab] }), [tab]);

  return (
    <TabularReportScreen
      config={config}
      icon={Users}
      period={period}
      onPeriodChange={setPeriod}
      range={range}
      onRangeChange={setRange}
      extra={extra}
      toolbar={
        <ToggleGroup
          type="single"
          value={tab}
          onValueChange={(next) => next && setTab(next as CustomerSupplierTab)}
          variant="outline"
          // On paper, a tab bar is a control with nothing left to switch
          // between — the printed sheet is already the one tab that was on
          // screen. (The old report printed this bar; that was a defect, not
          // a convention worth keeping.)
          className="flex-wrap justify-start print:hidden"
          aria-label="Record type"
        >
          {CUSTOMER_SUPPLIER_TABS.map((option) => (
            <ToggleGroupItem key={option} value={option}>
              {option}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
      defaultPageSize={50}
      emptyIcon={EMPTY_COPY[tab].icon}
      emptyTitle={EMPTY_COPY[tab].title}
      emptyDescription={EMPTY_COPY[tab].description}
      emptyAction={EMPTY_COPY[tab].action}
    />
  );
}
