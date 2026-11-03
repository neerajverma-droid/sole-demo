"use client";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { cn } from "@/lib/utils";

/**
 * What actually reaches the printer when a report's Print is used.
 *
 * `globals.css` prints by hiding `body *` and unhiding `.print-document` — so a
 * screen that calls `window.print()` without marking its content prints a blank
 * page. Every report's Print did exactly that; this is the wrapper that gives
 * them something to print.
 *
 * The header only exists on paper. On screen the page already says which
 * report, which business and which dates — in the page header, the switcher and
 * the period control — but none of that survives onto a sheet someone hands to
 * an accountant, so it's restated here and hidden from the screen.
 */
export function ReportPrintFrame({
  title,
  rangeLabel,
  children,
  className,
}: {
  title: string;
  /** "1 Jul 2026 – 30 Jun 2027", or omitted for an undated report. */
  rangeLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { business } = useActiveBusiness();

  return (
    <div className={cn("print-document space-y-6", className)}>
      <header className="hidden print:block">
        <h1 className="text-lg font-semibold">{title}</h1>
        {business?.name && <p className="text-sm">{business.name}</p>}
        {rangeLabel && <p className="text-sm tabular">{rangeLabel}</p>}
      </header>
      {children}
    </div>
  );
}
