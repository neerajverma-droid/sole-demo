"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PrefixInput } from "@/components/ui/prefix-input";
import { invoiceMoney } from "@/lib/invoices";
import { billTotals, newBillLine, type BillLine } from "@/lib/bills";
import { cn } from "@/lib/utils";

/**
 * The bill's lines as a small grid: description, quantity, unit price
 * (excluding tax), whether the line is taxed, and what it comes to. Totals sit
 * underneath, worked the same way the server works them.
 *
 * `taxWord` is null for a business that isn't registered for tax — the tax
 * column goes, and no line carries any.
 */
export function BillLineItems({
  lines,
  onChange,
  rate,
  taxWord,
  currencyMark,
  readOnly = false,
  errorFor,
}: {
  lines: BillLine[];
  onChange: (lines: BillLine[]) => void;
  rate: number;
  taxWord: string | null;
  currencyMark: string;
  readOnly?: boolean;
  /** A message for one cell, keyed `line-<key>-quantity` / `line-<key>-price`. */
  errorFor: (key: string) => string | undefined;
}) {
  const totals = billTotals(lines, taxWord ? rate : 0);
  const rowTotal = (key: string) =>
    totals.rows.find((row) => row.key === key)?.gross ?? 0;

  const update = (key: string, values: Partial<BillLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...values } : line)));
  const remove = (key: string) => {
    const next = lines.filter((line) => line.key !== key);
    // Never an empty grid — there's always one row to type into.
    onChange(next.length > 0 ? next : [newBillLine()]);
  };

  const columns = taxWord
    ? "sm:grid-cols-[minmax(0,1fr)_80px_120px_64px_110px_36px]"
    : "sm:grid-cols-[minmax(0,1fr)_80px_120px_110px_36px]";

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid",
          columns,
        )}
        aria-hidden
      >
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit price (ex {taxWord ?? "tax"})</span>
        {taxWord && <span className="text-center">{taxWord}</span>}
        <span className="text-right">Amount</span>
        <span />
      </div>

      <ul className="space-y-2">
        {lines.map((line, index) => {
          const quantityError = errorFor(`line-${line.key}-quantity`);
          const priceError = errorFor(`line-${line.key}-price`);
          return (
            <li
              key={line.key}
              className={cn(
                "grid grid-cols-2 items-center gap-2 rounded-md border p-2 sm:border-0 sm:p-0",
                columns,
              )}
            >
              <Input
                className="col-span-2 sm:col-span-1"
                value={line.description}
                onChange={(event) => update(line.key, { description: event.target.value })}
                placeholder="What was billed"
                aria-label={`Line ${index + 1} description`}
                disabled={readOnly}
              />
              <Input
                className={cn(
                  "text-right tabular",
                  quantityError && "border-destructive focus-visible:ring-destructive",
                )}
                value={line.quantity}
                inputMode="decimal"
                onChange={(event) => update(line.key, { quantity: event.target.value })}
                aria-label={`Line ${index + 1} quantity`}
                aria-invalid={!!quantityError}
                title={quantityError}
                disabled={readOnly}
              />
              <PrefixInput
                prefix={currencyMark}
                className="text-right tabular"
                value={line.price}
                inputMode="decimal"
                placeholder="0.00"
                onChange={(event) => update(line.key, { price: event.target.value })}
                aria-label={`Line ${index + 1} unit price`}
                aria-invalid={!!priceError}
                title={priceError}
                disabled={readOnly}
              />
              {taxWord && (
                <label className="flex items-center justify-center gap-2 text-sm sm:justify-center">
                  <Checkbox
                    checked={line.gst}
                    onCheckedChange={(checked) => update(line.key, { gst: checked === true })}
                    aria-label={`Line ${index + 1} includes ${taxWord}`}
                    disabled={readOnly}
                  />
                  <span className="sm:sr-only">{taxWord}</span>
                </label>
              )}
              <span className="text-right text-sm font-medium tabular">
                {invoiceMoney(rowTotal(line.key))}
              </span>
              {readOnly ? (
                <span />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 justify-self-end text-muted-foreground hover:text-destructive"
                  onClick={() => remove(line.key)}
                  aria-label={`Remove line ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...lines, newBillLine({ gst: lines[lines.length - 1]?.gst ?? false })])}
        >
          <Plus />
          Add line
        </Button>
      )}

      <dl className="ml-auto w-full max-w-xs space-y-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular">{invoiceMoney(totals.subTotal)}</dd>
        </div>
        {taxWord && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{taxWord}</dt>
            <dd className="tabular">{invoiceMoney(totals.totalGst)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t pt-1.5 font-semibold">
          <dt>Total</dt>
          <dd className="tabular">{invoiceMoney(totals.total)}</dd>
        </div>
      </dl>
    </div>
  );
}
