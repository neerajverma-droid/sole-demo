"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableHead } from "@/components/ui/table";
import type { DocumentCurrency } from "@/lib/invoices";

/**
 * The Currency column on a line-item table.
 *
 * It only appears when the selected client is recorded against a currency
 * other than AUD, and it's the same switch on every row rather than a
 * per-line choice: an invoice totals to one figure, so it can only be written
 * in one currency. Repeating it down the rows is how the reference product
 * puts the decision where the prices are being typed, which is where someone
 * actually notices they're entering the wrong money.
 */
export function CurrencyHead() {
  return <TableHead className="w-[110px] text-center">Currency</TableHead>;
}

export function CurrencyCell({
  currency,
  checked,
  onChange,
  rowLabel,
}: {
  currency: DocumentCurrency;
  checked: boolean;
  onChange?: (value: boolean) => void;
  rowLabel: string;
}) {
  return (
    <TableCell className="text-center">
      <label
        className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 text-xs font-medium"
        title={`Use ${currency} pricing on this invoice`}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onChange?.(value === true)}
          aria-label={`Price this invoice in ${currency}, ${rowLabel}`}
        />
        <span className="tabular text-muted-foreground">{currency}</span>
      </label>
    </TableCell>
  );
}
