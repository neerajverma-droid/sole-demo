"use client";

import Link from "next/link";
import {
  CircleAlert,
  CirclePause,
  Clock,
  Plus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  payrollDate,
  type PayrollSeats,
} from "@/lib/payroll";
import { cn } from "@/lib/utils";

/** Where payroll is switched on and its first seats bought. */
export const PAYROLL_BILLING_HREF = "/settings?section=subscription";

type Tone = "warning" | "danger" | "primary";

const TILE: Record<Tone, string> = {
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  primary: "bg-primary/10 text-primary",
};

/**
 * One flat notice card — the same shape as the asset-finance banner: icon tile,
 * a title and a sentence, and the action on the right.
 */
export function PayrollNotice({
  icon: Icon,
  tone,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
      role="status"
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
          TILE[tone],
        )}
        aria-hidden
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </section>
  );
}

/**
 * Whatever the seat subscription's state stops you doing, said once at the top
 * of the screen: not enabled, payment overdue, paused, or (where `onAddSeats`
 * is passed) out of seats. Renders nothing when payroll is simply active.
 */
export function PayrollSeatsNotice({
  seats,
  onAddSeats,
}: {
  seats: PayrollSeats;
  /** Only screens that add employees warn about the seat limit. */
  onAddSeats?: () => void;
}) {
  if (seats.status === "NOT_STARTED" || seats.status === "CANCELED") {
    return (
      <PayrollNotice
        icon={UsersRound}
        tone="primary"
        title="Payroll isn't enabled"
        description="Turn payroll on and choose how many employee seats you need — each seat is billed per employee."
        action={
          <Button size="sm" asChild>
            <Link href={PAYROLL_BILLING_HREF}>Enable payroll</Link>
          </Button>
        }
      />
    );
  }

  if (seats.status === "FROZEN") {
    return (
      <PayrollNotice
        icon={CirclePause}
        tone="danger"
        title="Payroll is paused"
        description="Pay runs are on hold until the overdue seat balance is paid. Update your payment method to resume."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href={PAYROLL_BILLING_HREF}>Update payment</Link>
          </Button>
        }
      />
    );
  }

  if (seats.status === "PAST_DUE") {
    return (
      <PayrollNotice
        icon={Clock}
        tone="warning"
        title="Seat payment overdue"
        description={
          seats.gracePeriodEnd
            ? `Payroll keeps running until ${payrollDate(seats.gracePeriodEnd)}. Pay the balance before then to avoid a pause.`
            : "Payroll keeps running for now. Pay the balance to avoid a pause."
        }
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href={PAYROLL_BILLING_HREF}>Update payment</Link>
          </Button>
        }
      />
    );
  }

  const full =
    seats.availableSeats <= 0 ||
    (seats.employeeLimit > 0 && seats.activeEmployees >= seats.employeeLimit);

  if (onAddSeats && full) {
    return (
      <PayrollNotice
        icon={CircleAlert}
        tone="warning"
        title={`Every seat is in use (${seats.activeEmployees}/${seats.employeeLimit})`}
        description="Add seats to take on another employee. Removing an employee frees their seat."
        action={
          <Button size="sm" onClick={onAddSeats}>
            <Plus />
            Add seats
          </Button>
        }
      />
    );
  }

  return null;
}
