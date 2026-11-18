"use client";

import { Repeat } from "lucide-react";

import { Badge, badgeVariants } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  billBadge,
  billRepeatLabel,
  occurrenceLabel,
  scheduleEndLabel,
  scheduleLabel,
  type Bill,
  type BillScheduleSummary,
} from "@/lib/bills";
import { formatInvoiceDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

/** The bill's one status: Paid, Overdue, Part paid, Saved or Unpaid. */
export function BillStatusBadge({
  bill,
  className,
}: {
  bill: Pick<Bill, "status" | "paymentStatus" | "isOverdue">;
  className?: string;
}) {
  const badge = billBadge(bill);
  return (
    <Badge variant={badge.variant} className={className}>
      {badge.label}
    </Badge>
  );
}

/**
 * The marker beside a repeating bill's supplier — the invoice list's
 * "Recurring" badge, naming how often instead ("Monthly · 3 of 12"). Muted
 * once the repeat has finished.
 *
 * With `onManage` it's a button: hovering or focusing it shows the schedule in
 * a tooltip, and clicking opens Manage repeat. Without it (inside a row that's
 * already a link) it stays a plain badge with the same summary as its title.
 */
export function RepeatBadge({
  schedule,
  occurrenceNo,
  onManage,
  className,
}: {
  schedule: BillScheduleSummary;
  occurrenceNo: number | null;
  onManage?: () => void;
  className?: string;
}) {
  const position = occurrenceLabel(occurrenceNo, schedule.totalCount);
  const active = schedule.status === "active";
  const end = scheduleEndLabel(schedule);
  const details = [
    scheduleLabel(schedule),
    position ? `This is bill ${position}` : null,
    active && schedule.nextDate ? `Next bill on ${formatInvoiceDate(schedule.nextDate)}` : schedule.status === "stopped" ? "Stopped" : "Finished",
    active ? end : null,
  ].filter((line): line is string => !!line);

  // A span with the Badge's own styling: Badge renders a div, which can't sit inside the button below.
  const badge = (
    <span
      className={cn(
        badgeVariants({ variant: "outline" }),
        "shrink-0 gap-1 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide",
        active ? "border-primary/30 bg-primary/[0.06] text-primary" : "text-muted-foreground",
        onManage && "cursor-pointer hover:bg-primary/[0.12]",
        className,
      )}
      title={onManage ? undefined : details.join(" · ")}
    >
      <Repeat className="size-3" aria-hidden />
      {billRepeatLabel(schedule.frequency)}
      {position && <span className="font-medium normal-case opacity-80">· {position}</span>}
    </span>
  );

  if (!onManage) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onManage}
          className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${details.join(". ")}. Manage repeat`}
        >
          {badge}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-60">
        <ul className="space-y-0.5">
          {details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-1 text-muted-foreground">Click to manage this repeat</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** "Expected" for a copy a schedule hasn't made yet. */
export function ExpectedBadge({ position }: { position: string | null }) {
  return (
    <Badge variant="outline" className="gap-1 border-dashed text-[10px] font-medium text-muted-foreground">
      <Repeat className="size-3" aria-hidden />
      Expected{position ? ` · ${position}` : ""}
    </Badge>
  );
}

/** A supplier's initial in a tinted square — the list's stand-in for a logo. */
export function SupplierMark({ name, muted, className }: { name: string; muted?: boolean; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg text-sm font-semibold",
        muted ? "border border-dashed border-border text-muted-foreground" : "bg-primary/10 text-primary",
        className,
      )}
      aria-hidden
    >
      {initial}
    </span>
  );
}
