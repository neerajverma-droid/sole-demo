"use client";

import { Minus, Plus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  PAYROLL_SEAT_PRICE,
  payrollMoney,
  plural,
} from "@/lib/payroll";
import { cn } from "@/lib/utils";

export type PayrollSeatsChoice = {
  enabled: boolean;
  seats: number;
  /** Only selectable on an annual plan — a monthly plan bills seats monthly. */
  interval: "monthly" | "annual";
};

export const DEFAULT_PAYROLL_SEATS = 5;
const MAX_SEATS = 500;

/** What the choice adds to the bill, and over what period. */
export function payrollSeatsCost(choice: PayrollSeatsChoice): {
  amount: number;
  suffix: "/mo" | "/yr";
} {
  if (!choice.enabled) return { amount: 0, suffix: "/mo" };
  return choice.interval === "annual"
    ? { amount: choice.seats * PAYROLL_SEAT_PRICE.annual, suffix: "/yr" }
    : { amount: choice.seats * PAYROLL_SEAT_PRICE.monthly, suffix: "/mo" };
}

/**
 * Payroll, as part of the plan.
 *
 * Seats are prepaid and ride on the same Stripe subscription as the plan, so
 * they're chosen here alongside it rather than somewhere of their own — the
 * same place sole-webapp's plan picker offers them. Top-ups mid-cycle happen
 * from the payroll screens instead.
 */
export function PayrollSeatsPicker({
  value,
  onChange,
  planInterval,
  disabled,
}: {
  value: PayrollSeatsChoice;
  onChange: (next: PayrollSeatsChoice) => void;
  /** The plan's own billing interval — seats can only go annual on an annual plan. */
  planInterval: "monthly" | "annual";
  disabled?: boolean;
}) {
  const cost = payrollSeatsCost(value);
  const setSeats = (next: number) =>
    onChange({
      ...value,
      seats: Math.min(MAX_SEATS, Math.max(1, Math.round(next) || 1)),
    });

  return (
    <div
      className={cn(
        "space-y-4 rounded-md border p-4 transition-colors",
        value.enabled && "border-primary/40 bg-primary/[0.03]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-4"
            aria-hidden
          >
            <UsersRound />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">Payroll</p>
            <p className="text-xs text-muted-foreground">
              Pay runs, payslips and Single Touch Payroll.{" "}
              {payrollMoney(PAYROLL_SEAT_PRICE.monthly)} per employee a month,
              prepaid — every employee needs a seat.
            </p>
          </div>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          disabled={disabled}
          aria-label="Enable payroll"
        />
      </div>

      {value.enabled && (
        <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Employee seats</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => setSeats(value.seats - 1)}
                disabled={disabled || value.seats <= 1}
                aria-label="One fewer seat"
              >
                <Minus />
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_SEATS}
                value={value.seats}
                onChange={(event) => setSeats(Number(event.target.value))}
                disabled={disabled}
                className="w-20 text-center tabular"
                aria-label="Employee seats"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => setSeats(value.seats + 1)}
                disabled={disabled || value.seats >= MAX_SEATS}
                aria-label="One more seat"
              >
                <Plus />
              </Button>
            </div>
          </div>

          {planInterval === "annual" && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Seats billed</p>
              <ToggleGroup
                type="single"
                value={value.interval}
                onValueChange={(next) =>
                  next && onChange({ ...value, interval: next as "monthly" | "annual" })
                }
                variant="outline"
                size="sm"
                disabled={disabled}
              >
                <ToggleGroupItem value="monthly">
                  Monthly · {payrollMoney(PAYROLL_SEAT_PRICE.monthly)}
                </ToggleGroupItem>
                <ToggleGroupItem value="annual">
                  Yearly · {payrollMoney(PAYROLL_SEAT_PRICE.annual)}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}

          <p className="text-sm tabular">
            <span className="text-muted-foreground">{plural(value.seats, "seat")} · </span>
            <span className="font-semibold">
              +{payrollMoney(cost.amount)}
              {cost.suffix}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
