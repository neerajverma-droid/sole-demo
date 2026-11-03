"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BadgeDollarSign,
  ChevronRight,
  FileText,
  MapPin,
  Percent,
  ReceiptText,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { money } from "@/lib/dashboard-data";
import type { AreaCustomer, CustomerAreaDetail } from "@/lib/customer-areas";
import { cn } from "@/lib/utils";

/**
 * One area of the map, opened up.
 *
 * Everything here is the area's own share of figures that appear whole
 * elsewhere on the dashboard — the same invoices, quotes and contacts, filtered
 * to one place — so the panel can be read beside the ranking without the two
 * ever disagreeing.
 */
export function CustomerAreaDetailSheet({
  detail,
  open,
  onOpenChange,
  metricLabel,
  isTopArea,
}: {
  detail: CustomerAreaDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the map is currently colouring and sizing markers by. */
  metricLabel: string;
  /** Drives the pricing suggestion — only worth raising where the money is. */
  isTopArea: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        {detail && (
          <>
            <SheetHeader className="space-y-2 border-b p-6 pr-14 text-left">
              <SheetTitle className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
                {detail.displayName}
              </SheetTitle>
              <SheetDescription>
                {detail.customerCount}{" "}
                {detail.customerCount === 1 ? "customer" : "customers"} in this
                area
              </SheetDescription>
              <p className="text-xs text-muted-foreground">
                Colour &amp; size by {metricLabel.toLowerCase()}
              </p>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
              <AreaStats detail={detail} />
              <AreaCustomers customers={detail.customers} />
              <AreaActions detail={detail} isTopArea={isTopArea} />
            </div>

            <AddressValidation addresses={detail.addresses} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ *
 * Stats
 * ------------------------------------------------------------------ */

/**
 * The dashboard's KPI cards, scoped to the area: same order, same tabular
 * figures, colour only where a figure carries a verdict — paid is good news,
 * overdue is not.
 */
function AreaStats({ detail }: { detail: CustomerAreaDetail }) {
  const stats: {
    key: string;
    label: string;
    value: string;
    caption?: string;
    icon: LucideIcon;
    tone?: string;
  }[] = [
    {
      key: "customers",
      label: "Customers",
      value: String(detail.customerCount),
      caption: `${detail.addresses.total} with an address on file`,
      icon: Users,
    },
    {
      key: "invoiced",
      label: "Invoiced",
      value: money(detail.invoiced),
      caption: "Excludes drafts",
      icon: ReceiptText,
    },
    {
      key: "paid",
      label: "Paid",
      value: money(detail.paid),
      caption:
        detail.invoiced > 0
          ? `${Math.round((detail.paid / detail.invoiced) * 100)}% of invoiced`
          : "Nothing invoiced yet",
      icon: BadgeDollarSign,
      tone: "text-success",
    },
    {
      key: "overdue",
      label: "Overdue",
      value: money(detail.overdue),
      caption:
        detail.overdueCount > 0
          ? `${detail.overdueCount} ${
              detail.overdueCount === 1 ? "customer" : "customers"
            } behind`
          : "Nothing overdue",
      icon: AlertCircle,
      tone: detail.overdue > 0 ? "text-warning" : undefined,
    },
    {
      key: "pipeline",
      label: "Quote pipeline",
      value: money(detail.quotePipeline),
      caption: `${detail.openQuoteCount} open ${
        detail.openQuoteCount === 1 ? "quote" : "quotes"
      }`,
      icon: FileText,
    },
    {
      key: "conversion",
      label: "Quote conversion",
      value: detail.conversion === null ? "—" : `${detail.conversion}%`,
      caption: "Accepted vs quoted value",
      icon: Percent,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map((stat) => (
        <div
          key={stat.key}
          className="min-w-0 rounded-lg border border-border bg-card p-3 shadow-sm"
        >
          <dt className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <stat.icon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{stat.label}</span>
          </dt>
          <dd className="mt-2 space-y-1">
            <p
              className={cn(
                "text-lg font-semibold leading-none tracking-tight tabular",
                stat.tone,
              )}
            >
              {stat.value}
            </p>
            {stat.caption && (
              <p className="truncate text-xs text-muted-foreground tabular">
                {stat.caption}
              </p>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

/**
 * Who the area's figures are actually made of. Sorted by invoiced because that
 * is what the map is ranked on; the arrow flips it for the other question,
 * which client here is the smallest.
 */
function AreaCustomers({ customers }: { customers: AreaCustomer[] }) {
  const [descending, setDescending] = React.useState(true);

  const sorted = React.useMemo(
    () =>
      [...customers].sort((a, b) =>
        descending ? b.invoiced - a.invoiced : a.invoiced - b.invoiced,
      ),
    [customers, descending],
  );

  if (customers.length === 0) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-tight">Customers</h3>
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No client records sit in this area yet.
        </p>
      </section>
    );
  }

  const columns =
    "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,5.5rem))]";

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold tracking-tight">Customers</h3>
        <button
          type="button"
          onClick={() => setDescending((value) => !value)}
          aria-label={`Sort by invoiced, ${
            descending ? "highest first" : "lowest first"
          }`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Invoiced
          {descending ? (
            <ArrowDown className="size-3.5" aria-hidden />
          ) : (
            <ArrowUp className="size-3.5" aria-hidden />
          )}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {/* Column names, where there's width for columns. */}
        <div
          className={cn(
            "hidden gap-x-3 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:grid",
            columns,
          )}
          aria-hidden
        >
          <span>Customer</span>
          <span className="text-right">Invoiced</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Overdue</span>
          <span className="text-right">Open quotes</span>
        </div>

        <ul className="divide-y divide-border">
          {sorted.map((customer) => (
            <li key={customer.key}>
              <CustomerRow customer={customer} columns={columns} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CustomerRow({
  customer,
  columns,
}: {
  customer: AreaCustomer;
  columns: string;
}) {
  const cells = (
    <>
      <span className="min-w-0 truncate text-sm">{customer.name}</span>
      <span className="text-right text-sm font-medium tabular">
        {money(customer.invoiced)}
      </span>

      {/* Below sm the three supporting figures move to their own line, where
          they can be labelled — four money columns don't fit a phone. */}
      <span className="col-span-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular sm:col-span-1 sm:block sm:text-right sm:text-sm sm:text-foreground">
        <span className="sm:hidden">Paid</span>
        {money(customer.paid)}
      </span>
      <span
        className={cn(
          "col-span-2 flex flex-wrap items-center gap-x-2 text-xs tabular sm:col-span-1 sm:block sm:text-right sm:text-sm",
          customer.overdue > 0 ? "text-warning" : "text-muted-foreground",
        )}
      >
        <span className="sm:hidden">Overdue</span>
        {money(customer.overdue)}
      </span>
      <span className="col-span-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular sm:col-span-1 sm:block sm:text-right sm:text-sm sm:text-foreground">
        <span className="sm:hidden">Open quotes</span>
        {money(customer.openQuotes)}
      </span>
    </>
  );

  const className = cn(
    "grid w-full items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-left outline-none transition-colors",
    columns,
  );

  // A deleted contact has no record to route to, so its row stays a row.
  if (!customer.contactId) {
    return <div className={className}>{cells}</div>;
  }

  return (
    <Link
      href={`/contacts?contact=${customer.contactId}`}
      aria-label={`Open ${customer.name}`}
      className={cn(
        className,
        "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      )}
    >
      {cells}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Suggested actions
 * ------------------------------------------------------------------ */

/**
 * What this area is actually asking for. A card only appears where there's a
 * figure behind it — a suggestion to chase nothing is noise.
 */
function AreaActions({
  detail,
  isTopArea,
}: {
  detail: CustomerAreaDetail;
  isTopArea: boolean;
}) {
  const cards = [
    detail.quotePipeline > 0 && {
      key: "quotes",
      icon: FileText,
      title: "Follow up quotes",
      value: money(detail.quotePipeline),
      body: `${detail.openQuoteCount} open ${
        detail.openQuoteCount === 1 ? "quote" : "quotes"
      } waiting on a decision here.`,
      href: "/quotes",
      cta: "View quotes",
    },
    isTopArea &&
      detail.invoiced > 0 && {
        key: "pricing",
        icon: Tag,
        title: "Review pricing",
        value: money(detail.invoiced),
        body: `Your strongest area by invoiced value — worth checking your rates still match the work.`,
        href: "/sales/products",
        cta: "Open pricing",
      },
    detail.overdue > 0 && {
      key: "overdue",
      icon: AlertCircle,
      title: "Collect overdue",
      value: money(detail.overdue),
      body: "Send reminders / attach overdraft",
      href: "/invoices",
      cta: "View invoices",
      tone: true,
    },
  ].filter(Boolean) as {
    key: string;
    icon: LucideIcon;
    title: string;
    value: string;
    body: string;
    href: string;
    cta: string;
    tone?: boolean;
  }[];

  if (cards.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight">Suggested actions</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="group flex min-w-0 flex-col rounded-lg border border-border bg-card p-3 shadow-sm outline-none transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-xl [&_svg]:size-4",
                card.tone
                  ? "bg-warning/10 text-warning"
                  : "bg-primary/10 text-primary",
              )}
              aria-hidden
            >
              <card.icon />
            </span>
            <span className="mt-2.5 text-sm font-medium">{card.title}</span>
            <span
              className={cn(
                "mt-1 text-base font-semibold leading-none tabular",
                card.tone && "text-warning",
              )}
            >
              {card.value}
            </span>
            <span className="mt-1.5 text-xs text-muted-foreground">
              {card.body}
            </span>
            <span className="mt-2 inline-flex items-center gap-0.5 text-xs font-medium text-primary">
              {card.cta}
              <ChevronRight className="size-3.5 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Footer
 * ------------------------------------------------------------------ */

/**
 * How much to trust the pins. An address that only resolves to a suburb is
 * placed at its centroid, so a marker's position is worth what this bar says
 * it is — said plainly rather than left for someone to discover.
 */
function AddressValidation({
  addresses,
}: {
  addresses: { verified: number; total: number };
}) {
  const percent =
    addresses.total > 0
      ? Math.round((addresses.verified / addresses.total) * 100)
      : 0;

  return (
    <div className="space-y-2 border-t bg-muted/30 px-6 py-4">
      <p className="text-xs text-muted-foreground tabular">
        <span className="font-medium text-foreground">Address validation</span> —{" "}
        {addresses.verified} of {addresses.total}{" "}
        {addresses.total === 1 ? "address" : "addresses"} verified to street
        level; rest placed at suburb centroid.
      </p>
      <Progress
        value={percent}
        aria-label={`${percent}% of addresses verified to street level`}
        className="h-1.5 bg-success/20 [&>div]:bg-success"
      />
    </div>
  );
}
