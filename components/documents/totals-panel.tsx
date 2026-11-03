"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  GST_PERCENT,
  currencySymbol,
  formatDocumentMoney,
  invoiceTotals,
  lineGstPercent,
} from "@/lib/invoices";
import type { DocumentCurrency, InvoiceLineItem } from "@/lib/invoices";
import { useCountryContext } from "@/hooks/use-country-context";
import { taxWord } from "@/lib/country-context";

/**
 * Live totals for both editors. The extra-discount row only renders when a
 * handler is passed — invoices offer it, quotes don't.
 */
export function TotalsPanel({
  items,
  extraDiscount,
  onExtraDiscountChange,
  align = "end",
  showGst = true,
  gstPercent = GST_PERCENT,
  currency: currencyProp,
}: {
  items: InvoiceLineItem[];
  extraDiscount: string;
  onExtraDiscountChange?: (value: string) => void;
  /** "end" floats it right; "stretch" fills the column it sits in. */
  align?: "end" | "stretch";
  /** False when Sales settings has GST switched off for this document type. */
  showGst?: boolean;
  /** The business's own GST rate, so the row matches what's invoiced. */
  gstPercent?: number;
  /** The currency the document is written in — prices are entered in it. */
  currency?: DocumentCurrency;
}) {
  // The tax is named by the business's country: GST here, VAT in South Africa.
  const { country } = useCountryContext();
  const tax = taxWord(country);
  // The business's own currency unless the document is written in another.
  const currency = currencyProp ?? country.currency;
  const totals = invoiceTotals(items, extraDiscount, gstPercent);
  // One rate across the taxed lines is printed with the row; a saved invoice whose
  // lines were charged at different rates just says "GST", since no single
  // percentage would be true.
  const taxedRates = new Set(
    items
      .filter((item) => item.gst)
      .map((item) => lineGstPercent(item, gstPercent)),
  );
  const shownRate =
    taxedRates.size > 1
      ? null
      : taxedRates.size === 1
        ? [...taxedRates][0]
        : gstPercent;
  const money = (value: number) => formatDocumentMoney(value, currency);

  return (
    <div className={align === "end" ? "flex justify-end" : undefined}>
      <dl
        className={cn(
          "w-full space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm",
          align === "end" && "sm:max-w-sm",
        )}
      >
        <TotalRow label="Subtotal" value={money(totals.subtotal)} />
        <TotalRow label="Discount" value={`−${money(totals.discountTotal)}`} />

        {onExtraDiscountChange && (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Extra discount</dt>
            <dd className="relative w-28">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {currencySymbol(currency)}
              </span>
              <Input
                // A longer prefix (NZ$, US$) needs more room than a bare $.
                className={cn(
                  "h-9 text-right tabular",
                  currencySymbol(currency).length > 1 ? "pl-11" : "pl-7",
                )}
                inputMode="decimal"
                value={extraDiscount}
                onChange={(event) => onExtraDiscountChange(event.target.value)}
                aria-label="Extra discount"
              />
            </dd>
          </div>
        )}

        {/* Off means the row isn't printed, not that it shows zero. */}
        {showGst && (
          <TotalRow
            label={shownRate === null ? tax : `${tax} (${shownRate}%)`}
            value={money(totals.gstTotal)}
          />
        )}
        <div className="flex items-center justify-between gap-4 border-t pt-3">
          <dt className="text-sm font-semibold">Total</dt>
          <dd className="text-2xl font-bold tracking-tight tabular">
            {money(totals.total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular">{value}</dd>
    </div>
  );
}
