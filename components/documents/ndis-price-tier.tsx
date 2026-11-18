"use client";

import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  NDIS_PRICE_TIERS,
  NDIS_PRICING_SCHEDULE,
  NDIS_PRICING_SCHEDULE_EFFECTIVE,
  ndisPriceTierOf,
  type NdisPriceOptions,
} from "@/lib/invoices";

/**
 * The Price tier picker of an NDIS line, built into the price field itself.
 *
 * The NDIS Pricing Schedule publishes three prices for a support — National,
 * Remote and Very remote. Picking a support from the catalogue fills the
 * National one; this is the arrow at the end of the price field, which opens the
 * three and ticks the one the field currently holds. It only ever *sets* the
 * price: the field stays an ordinary input, so the user can type their own
 * figure over it, and once it no longer matches a published price the menu says
 * so instead of ticking anything.
 *
 * It's the `trailing` control of the price cell, sharing the field's border the
 * way the discount's % / $ picker does.
 */
export function NdisPriceTierMenu({
  price,
  options,
  schedule,
  symbol,
  onPick,
  rowLabel,
}: {
  /** What the price field holds right now. */
  price: string;
  options: NdisPriceOptions;
  /** The schedule the prices come from, e.g. `2026-27`. */
  schedule?: string;
  /** The document's currency symbol. */
  symbol: string;
  /** Writes the chosen tier's price into the price field. */
  onPick: (price: string) => void;
  rowLabel: string;
}) {
  const tier = ndisPriceTierOf(price, options);
  const available = NDIS_PRICE_TIERS.filter((entry) => options[entry.key]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Choose a price tier, ${rowLabel}`}
          className="flex h-9 w-8 shrink-0 items-center justify-center border-l border-input text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <ChevronDown className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {schedule
            ? `NDIS Pricing Schedule ${schedule}`
            : "NDIS Pricing Schedule"}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={tier}
          onValueChange={(next) => {
            const chosen = NDIS_PRICE_TIERS.find(
              (entry) => entry.value === next,
            );
            const published = chosen ? options[chosen.key] : undefined;
            if (published) onPick(published);
          }}
        >
          {available.map((entry) => (
            <DropdownMenuRadioItem key={entry.value} value={entry.value}>
              <span className="flex-1">{entry.label}</span>
              <span className="tabular text-muted-foreground">
                {symbol}
                {options[entry.key]}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {/* Not a choice — it says why nothing above is ticked. */}
        {tier === "custom" && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Custom price — you&rsquo;ve entered your own.
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The badge beside the "Support items" heading: which NDIS Pricing Schedule the
 * catalogue's prices come from. How to use those prices is on hover, so the
 * note stays out of the way of the table while still saying, once for the whole
 * thing, that a price filled in for the user isn't one they typed.
 */
export function NdisPricingNote() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A span rather than the Badge itself: Badge doesn't forward a ref,
            which Radix needs on the trigger. Focusable, so the note is
            reachable without a mouse. */}
        <span
          tabIndex={0}
          className="inline-flex w-fit rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Badge
            variant="secondary"
            className="px-2 py-0 text-[11px] font-medium"
          >
            NDIS Pricing Schedule {NDIS_PRICING_SCHEDULE}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        Prices come from the schedule (from {NDIS_PRICING_SCHEDULE_EFFECTIVE}).
        Use the arrow in the price field to switch between National, Remote and
        Very remote, or type your own.
      </TooltipContent>
    </Tooltip>
  );
}
