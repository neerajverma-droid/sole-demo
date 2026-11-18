"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { pricingMoney } from "@/lib/pricing";
import {
  addonDisplayName,
  planDisplayName,
  type SubscriptionPlan,
} from "@/lib/subscription";
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
  compact = false,
}: {
  addon: SubscriptionPlan;
  checked: boolean;
  /** Switched on, and within the number the package includes for free. */
  includedInPlan: boolean;
  onToggle: () => void;
  discount: number;
  disabled?: boolean;
  /**
   * For a picker that has to fit one screen: the name cut to what it is called
   * (no cycle, no "Add-on" — see `addonDisplayName`) and the description held to
   * a line, whole in the tooltip.
   */
  compact?: boolean;
}) {
  const unavailable = addon.comingSoon || !!disabled;
  return (
    <Label
      htmlFor={`addon-${addon.slug}`}
      title={compact ? (addon.description ?? undefined) : undefined}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 font-normal",
        compact && "gap-2.5 p-2",
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
          {compact ? addonDisplayName(addon.name) : planDisplayName(addon.name)}
          {addon.comingSoon && !compact && (
            <Badge
              variant="outline"
              className="rounded-full px-1.5 py-0 text-[10px]"
            >
              Coming soon
            </Badge>
          )}
        </span>
        {addon.comingSoon && compact ? (
          // Where the description would be: beside the name it squeezes the
          // name onto two lines, and on a line of its own as well as the
          // description it makes every unreleased row a line taller. What it
          // would have said is still in the tooltip.
          <span className="block">
            <Badge
              variant="outline"
              className="rounded-full px-1.5 py-0 text-[10px]"
            >
              Coming soon
            </Badge>
          </span>
        ) : (
          addon.description && (
            <span
              className={cn(
                "block text-xs leading-relaxed text-muted-foreground",
                compact && "line-clamp-1",
              )}
            >
              {addon.description}
            </span>
          )
        )}
      </span>
      {includedInPlan ? (
        <span className="shrink-0 text-xs font-semibold text-success">
          Included
        </span>
      ) : (
        /*
          Per month, like the package rows and the total beside them — with the
          year's charge spelled out on an annual row, because $3.99 on its own
          read as a price the price list never sent ($47.90 / 12).
        */
        <span className="shrink-0 text-right">
          <Price full={addon.monthlyPrice} discount={discount} suffix="/mo" />
          {addon.interval === "annual" && (
            <span className="block text-[11px] text-muted-foreground tabular">
              {pricingMoney(Math.round(addon.price * discount * 100) / 100)}{" "}
              billed yearly
            </span>
          )}
        </span>
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
export function Price({
  full,
  discount,
  suffix,
}: {
  full: number;
  discount: number;
  /** The period, when the row doesn't already say it ("/mo"). */
  suffix?: string;
}) {
  const now = Math.round(full * discount * 100) / 100;
  const period = suffix && (
    <span className="text-xs font-normal text-muted-foreground">{suffix}</span>
  );
  if (discount >= 1 || full <= 0) {
    return (
      <span className="block shrink-0 text-sm font-semibold tabular">
        {pricingMoney(now)}
        {period}
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
        {period}
      </span>
    </span>
  );
}
