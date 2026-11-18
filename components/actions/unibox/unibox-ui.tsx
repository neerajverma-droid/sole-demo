"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Loader2, MoreHorizontal, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { AnimatedRows } from "@/components/actions/unibox/animated-rows";
import { cn } from "@/lib/utils";

/*
 * The pieces every "Everything else" card is built from.
 *
 * One anatomy for all eleven cards — tinted icon square, title, count chip and
 * one add action in the header; then rows of tile, title, status, amount,
 * action — so a grid of them reads as one system rather than eleven widgets.
 */

/** The row's primary action at rest: tinted, the way the urgent five wear it. */
export const TONAL_ACTION =
  "border-0 bg-primary/10 text-primary shadow-none hover:bg-primary/15 hover:text-primary";

/**
 * Where a card is being drawn. In the grid it's a card of its own; inside a
 * Quick Actions sheet the sheet already has the border and the title, so the
 * card keeps only its count, its header action and its rows.
 */
export const UniboxCardPlacement = React.createContext<"card" | "sheet">("card");

export function UniboxCard({
  icon: Icon,
  title,
  count,
  loading,
  action,
  tourId,
  sample,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** Hidden while loading, so the chip never flashes a zero. */
  count?: number;
  loading?: boolean;
  /** The header's one action — usually "New", "Log …" or "Add …". */
  action?: React.ReactNode;
  /** The onboarding tour's handle on this card. */
  tourId?: string;
  /** The rows are sample data shown for the tour, not the business's own. */
  sample?: boolean;
  children: React.ReactNode;
}) {
  const inSheet = React.useContext(UniboxCardPlacement) === "sheet";
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col",
        !inSheet && "rounded-xl border border-border bg-card p-4 shadow-sm",
      )}
      data-usertour={tourId}
    >
      <header className={cn("flex items-center gap-3", inSheet ? "justify-end" : "justify-between")}>
        <h3 className={cn("flex min-w-0 items-center gap-2 text-sm font-semibold", inSheet && "sr-only")}>
          <span
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-3.5"
            aria-hidden
          >
            <Icon />
          </span>
          <span className="truncate">{title}</span>
          {sample ? <SampleTag /> : null}
          {!loading && count != null ? (
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground tabular">
              {count}
            </span>
          ) : null}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Marks rows that are there for the tour, so nobody takes them for real data. */
export function SampleTag() {
  return (
    <span className="shrink-0 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-warning">
      Sample
    </span>
  );
}

/** Compact, so a header's action doesn't set the card's height. */
export const ADD_BUTTON = "h-7 shrink-0 gap-1 px-2.5 text-xs [&_svg]:size-3.5";

/** The header's add button — a button, or a link when the form is a page. */
export function CardAddButton({
  label,
  icon: Icon = Plus,
  href,
  onClick,
  disabled,
  busy,
}: {
  label: string;
  icon?: LucideIcon;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const content = (
    <>
      {busy ? <Loader2 className="animate-spin" /> : <Icon />}
      {label}
    </>
  );
  if (href) {
    return (
      <Button size="sm" asChild className={ADD_BUTTON}>
        <Link href={href}>{content}</Link>
      </Button>
    );
  }
  return (
    <Button size="sm" className={ADD_BUTTON} onClick={onClick} disabled={disabled || busy}>
      {content}
    </Button>
  );
}

/** A figure that heads the rows — "4.5 hrs tracked time", "12.0 km logged". */
export function CardFigure({ value, label }: { value: string; label: string }) {
  return (
    <p className="mt-2 flex items-baseline gap-1.5">
      <span className="text-lg font-semibold tabular">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </p>
  );
}

export function CardRows({
  loading,
  empty,
  emptyText,
  children,
}: {
  loading: boolean;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  /*
   * The empty line waits out the last row's exit, rather than replacing the
   * list the instant it empties and cutting that row off mid-fade.
   */
  const [showEmpty, setShowEmpty] = React.useState(empty);
  React.useEffect(() => {
    if (!empty) {
      setShowEmpty(false);
      return;
    }
    const timer = window.setTimeout(() => setShowEmpty(true), reduced ? 0 : 320);
    return () => window.clearTimeout(timer);
  }, [empty, reduced]);

  if (loading) {
    return (
      <div className="mt-2" aria-busy>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-2.5 py-2">
            <Skeleton className="size-7 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-2.5 w-2/5" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        ))}
      </div>
    );
  }
  if (empty && showEmpty) {
    return <p className="py-5 text-center text-xs text-muted-foreground">{emptyText}</p>;
  }
  // Each row keyed as the card keyed it, so a row a card stops listing (it was
  // matched, sent, invoiced) leaves and the next one arrives — see AnimatedRows.
  const rows = React.Children.toArray(children)
    .filter(React.isValidElement)
    .map((child) => ({ key: String(child.key), node: child }));
  return <AnimatedRows rows={rows} className="mt-1" />;
}

export function CardRow({
  icon: Icon,
  iconTone = "bg-primary/[0.08] text-primary",
  title,
  titleTitle,
  titleExtra,
  sub,
  subTone,
  extra,
  amount,
  amountTone,
  action,
  menu,
  tourId,
}: {
  icon: LucideIcon;
  iconTone?: string;
  title: string;
  /** Full text for the tooltip when the title is shortened. */
  titleTitle?: string;
  /** A chip beside the title — a planner stage, say. */
  titleExtra?: React.ReactNode;
  sub: React.ReactNode;
  subTone?: string;
  /** A third line, under the status. */
  extra?: React.ReactNode;
  amount?: string | null;
  amountTone?: string;
  action?: React.ReactNode;
  menu?: React.ReactNode;
  /** The onboarding tour's handle on this row. */
  tourId?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-2" data-usertour={tourId}>
      <span
        className={cn("grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-3.5", iconTone)}
        aria-hidden
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[13px] font-medium" title={titleTitle ?? title}>
            {title}
          </p>
          {titleExtra}
        </div>
        <p className={cn("truncate text-[11.5px] text-muted-foreground", subTone)}>{sub}</p>
        {extra ? <p className="truncate text-[11px] text-muted-foreground/80">{extra}</p> : null}
      </div>
      {amount ? (
        <span className={cn("shrink-0 whitespace-nowrap text-[13px] font-semibold tabular", amountTone)}>
          {amount}
        </span>
      ) : null}
      {action}
      {menu}
    </div>
  );
}

/** The row's action — tinted, fixed width so a column of them lines up. */
export function RowAction({
  label,
  onClick,
  busy,
  disabled,
  icon: Icon,
  variant = "tonal",
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  variant?: "tonal" | "danger";
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        "h-7 min-w-[76px] shrink-0 gap-1 rounded-md px-2.5 text-xs [&_svg]:size-3.5",
        variant === "tonal"
          ? TONAL_ACTION
          : "border-0 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
      )}
    >
      {busy ? <Loader2 className="animate-spin" /> : Icon ? <Icon /> : null}
      {busy ? "Please wait" : label}
    </Button>
  );
}

export function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          aria-label={label}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The design's segmented control — "Invoice 7 | Quote 2". */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  counts,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  counts?: Partial<Record<T, number>>;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="mt-3 inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((option) => {
        const on = option === value;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
            {counts?.[option] ? (
              <span className="ml-1 text-[11px] opacity-60 tabular">{counts[option]}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** The underline tabs under it — "To send · Overdue · Due soon". */
export function SubTabs<T extends string>({
  options,
  value,
  onChange,
  counts,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  counts?: Partial<Record<T, number>>;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="mt-2 flex gap-3 overflow-x-auto border-b border-border">
      {options.map((option) => {
        const on = option === value;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(option)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1 border-b-2 pb-1.5 text-xs font-semibold outline-none transition-colors focus-visible:text-primary",
              on ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
            <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground tabular">
              {counts?.[option] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
