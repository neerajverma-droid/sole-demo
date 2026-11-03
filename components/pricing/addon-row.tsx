"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { pricingMoney } from "@/lib/pricing";
import { type SubscriptionPlan } from "@/lib/subscription";
import { cn } from "@/lib/utils";

/**
 * One add-on, with its switch and its price.
 *
 * Shared rather than copied, because two screens now offer the same choice —
 * the pricing panel a new business sees, and Settings → Subscription, where an
 * existing one changes its mind. A second copy is a second place for "Included"
 * to stop matching what the package actually covers, and the allowance rule it
 * draws is already positional and easy to get subtly wrong.
 */
export function AddonRow({
  addon,
  checked,
  includedInPlan,
  onToggle,
  discount,
  disabled,
}: {
  addon: SubscriptionPlan;
  checked: boolean;
  /** Switched on, and within the number the package includes for free. */
  includedInPlan: boolean;
  onToggle: () => void;
  discount: number;
  disabled?: boolean;
}) {
  const unavailable = addon.comingSoon || !!disabled;
  return (
    <Label
      htmlFor={`addon-${addon.slug}`}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 font-normal",
        "motion-safe:transition-colors",
        checked
          ? "border-primary/40 bg-primary/[0.04]"
          : "border-border hover:bg-accent/40",
        addon.comingSoon && "cursor-not-allowed opacity-60",
      )}
    >
      <Checkbox
        id={`addon-${addon.slug}`}
        checked={checked}
        disabled={unavailable}
        onCheckedChange={onToggle}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {addon.name}
          {addon.comingSoon && (
            <Badge
              variant="outline"
              className="rounded-full px-1.5 py-0 text-[10px]"
            >
              Coming soon
            </Badge>
          )}
        </span>
        {addon.description && (
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {addon.description}
          </span>
        )}
      </span>
      {includedInPlan ? (
        <span className="shrink-0 text-xs font-semibold text-success">
          Included
        </span>
      ) : (
        <Price full={addon.monthlyPrice} discount={discount} />
      )}
    </Label>
  );
}

/**
 * A price, and what it was.
 *
 * The full figure stays visible and struck through whenever a discount is on,
 * stacked above the one being charged — the saving is the reason someone is
 * being shown this panel in the add-business flow.
 */
export function Price({ full, discount }: { full: number; discount: number }) {
  const now = Math.round(full * discount * 100) / 100;
  if (discount >= 1 || full <= 0) {
    return (
      <span className="shrink-0 text-sm font-semibold tabular">
        {pricingMoney(now)}
      </span>
    );
  }

  return (
    <span className="shrink-0 text-right">
      <span className="block text-xs text-muted-foreground line-through tabular">
        {pricingMoney(full)}
      </span>
      <span className="block text-sm font-semibold text-success tabular">
        {pricingMoney(now)}
      </span>
    </span>
  );
}
