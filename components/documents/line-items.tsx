"use client";

import * as React from "react";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrefixInput } from "@/components/ui/prefix-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DEFAULT_DISCOUNT_TYPE,
  GST_PERCENT,
  MONEY_DECIMALS,
  currencySymbol,
  formatDocumentMoney,
  lineItemErrors,
  lineTotals,
  type DiscountType,
  type DocumentCurrency,
  type InvoiceLineItem,
} from "@/lib/invoices";
import {
  CurrencyCell,
  CurrencyHead,
} from "@/components/documents/currency-cell";
import { ItemLookupInput } from "@/components/documents/item-lookup-input";
import { QtyTypeSelect } from "@/components/documents/qty-type-select";
import { Required } from "@/components/documents/field";
import {
  lineItemPatchFromSuggestion,
  searchInvoiceItems,
} from "@/lib/invoice-item-search";
import { cn } from "@/lib/utils";
import { useCountryContext } from "@/hooks/use-country-context";
import { taxWord } from "@/lib/country-context";

/** Line-item table shared by the invoice and quote editors. */
export function DocumentLineItems({
  items,
  onPatch,
  onRemove,
  onAdd,
  register,
  issueFor,
  showGst = true,
  gstPercent = GST_PERCENT,
  lookup = true,
  currency: currencyProp,
  clientCurrency = null,
  convertCurrency = false,
  onConvertCurrencyChange,
  perLineDiscountType = false,
}: {
  items: InvoiceLineItem[];
  onPatch: (id: string, patch: Partial<InvoiceLineItem>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  /** Registers a focus target so submit can jump to the first error. */
  register: (key: string) => (node: HTMLElement | null) => void;
  /**
   * What's missing from a field, by its key — the editor's own lookup, which
   * holds back "not filled in yet" until a save has been attempted.
   */
  issueFor?: (key: string) => string | undefined;
  /** False when Sales settings has GST switched off for this document type. */
  showGst?: boolean;
  /** The business's own GST rate, so line amounts match what's invoiced. */
  gstPercent?: number;
  /**
   * Whether the description field offers the saved-products lookup. On for
   * invoices; a caller with no product catalogue behind it can turn it off.
   */
  lookup?: boolean;
  /** What the prices on this document are written in. */
  currency?: DocumentCurrency;
  /** The client's own currency — a foreign one is what reveals the column. */
  clientCurrency?: DocumentCurrency | null;
  convertCurrency?: boolean;
  onConvertCurrencyChange?: (value: boolean) => void;
  /**
   * Whether a line's discount can be a flat amount as well as a percentage.
   * Off by default — the quote editor shares this table but only ever offers
   * a percentage, so its rows and its saved quotes stay exactly as they were.
   */
  perLineDiscountType?: boolean;
}) {
  // The tax is named by the business's country: GST here, VAT in South Africa.
  const { country } = useCountryContext();
  const tax = taxWord(country);
  // The business's own currency unless the document is written in another.
  const currency = currencyProp ?? country.currency;
  const symbol = currencySymbol(currency);
  // One switch for the whole document, shown on every row — a per-line
  // currency would mean an invoice adding up two different monies.
  const showCurrency =
    !!clientCurrency &&
    clientCurrency !== country.currency &&
    !!onConvertCurrencyChange;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <Table
          className={cn(
            showCurrency ? "min-w-[1090px]" : "min-w-[980px]",
            perLineDiscountType && "min-w-[1040px]",
            perLineDiscountType && showCurrency && "min-w-[1150px]",
          )}
        >
          <TableHeader>
            <TableRow>
              <TableHead>
                Item description
                <Required />
              </TableHead>
              <TableHead className="w-[110px] text-center">
                Quantity
                <Required />
              </TableHead>
              <TableHead className="w-[110px] text-center">Type</TableHead>
              <TableHead className="w-[130px] text-center">
                Price
                <Required />
              </TableHead>
              {showCurrency && <CurrencyHead />}
              <TableHead
                className={cn(
                  "text-center",
                  perLineDiscountType ? "w-[170px]" : "w-[110px]",
                )}
              >
                Discount
              </TableHead>
              {showGst && <TableHead className="w-[70px] text-center">{tax}</TableHead>}
              <TableHead className="w-[130px] text-right">Amount</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const errors = lineItemErrors(item);
              const line = lineTotals(item, gstPercent);
              const rowLabel = `line ${index + 1}`;
              const descriptionIssue = issueFor?.(`item-${item.id}-description`);
              const quantityIssue = errors.quantity ?? issueFor?.(`item-${item.id}-quantity`);
              const priceIssue = errors.price ?? issueFor?.(`item-${item.id}-price`);

              return (
                <TableRow key={item.id} className="align-top">
                  <TableCell>
                    {lookup ? (
                      <ItemLookupInput
                        search={(query) => searchInvoiceItems(query, false)}
                        queryKey="invoice"
                        inputRef={register(`item-${item.id}-description`)}
                        value={item.description}
                        onChange={(value) =>
                          onPatch(item.id, { description: value })
                        }
                        onSelect={(suggestion) =>
                          onPatch(
                            item.id,
                            lineItemPatchFromSuggestion(suggestion, item, {
                              ndis: false,
                              gstDefault: showGst,
                            }),
                          )
                        }
                        placeholder="What are you billing for?"
                        label={`Description, ${rowLabel}`}
                        invalid={!!descriptionIssue}
                      />
                    ) : (
                      <Input
                        ref={register(`item-${item.id}-description`)}
                        className={cn(
                          "h-9",
                          descriptionIssue &&
                            "border-destructive focus-visible:ring-destructive",
                        )}
                        aria-invalid={!!descriptionIssue}
                        value={item.description}
                        onChange={(event) =>
                          onPatch(item.id, { description: event.target.value })
                        }
                        placeholder="What are you billing for?"
                        aria-label={`Description, ${rowLabel}`}
                      />
                    )}
                    {descriptionIssue && (
                      <p className="mt-1 text-xs text-destructive">
                        {descriptionIssue}
                      </p>
                    )}
                  </TableCell>

                  <NumericCell
                    label={`Quantity, ${rowLabel}`}
                    value={item.quantity}
                    error={quantityIssue}
                    inputRef={register(`item-${item.id}-quantity`)}
                    onChange={(value) => onPatch(item.id, { quantity: value })}
                  />

                  <TableCell>
                    <QtyTypeSelect
                      value={item.qtyType}
                      onChange={(qtyType) => onPatch(item.id, { qtyType })}
                      label={`Type, ${rowLabel}`}
                    />
                  </TableCell>

                  <NumericCell
                    label={`Price, ${rowLabel}`}
                    value={item.price}
                    error={priceIssue}
                    hint={item.priceHint}
                    prefix={symbol}
                    maxDecimals={MONEY_DECIMALS}
                    inputRef={register(`item-${item.id}-price`)}
                    onChange={(value) => onPatch(item.id, { price: value })}
                  />

                  {showCurrency && clientCurrency && (
                    <CurrencyCell
                      currency={clientCurrency}
                      checked={convertCurrency}
                      onChange={onConvertCurrencyChange}
                      rowLabel={rowLabel}
                    />
                  )}

                  {(() => {
                    const discountType =
                      item.discountType ?? DEFAULT_DISCOUNT_TYPE;
                    const isAmount = discountType === "amount";
                    return (
                      <NumericCell
                        label={`Discount ${isAmount ? "amount" : "percent"}, ${rowLabel}`}
                        value={item.discountPercent}
                        error={errors.discountPercent}
                        prefix={
                          perLineDiscountType || !isAmount ? undefined : symbol
                        }
                        suffix={
                          perLineDiscountType || isAmount ? undefined : "%"
                        }
                        maxDecimals={MONEY_DECIMALS}
                        inputRef={register(`item-${item.id}-discountPercent`)}
                        onChange={(value) =>
                          onPatch(item.id, { discountPercent: value })
                        }
                        trailing={
                          perLineDiscountType ? (
                            <Select
                              value={discountType}
                              onValueChange={(value) =>
                                onPatch(item.id, {
                                  discountType: value as DiscountType,
                                })
                              }
                            >
                              <SelectTrigger
                                className="h-9 w-[64px] shrink-0 rounded-l-none border-0 border-l border-input bg-transparent px-2 shadow-none hover:bg-transparent focus:ring-0"
                                aria-label={`Discount type, ${rowLabel}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percent">%</SelectItem>
                                <SelectItem value="amount">{symbol}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : undefined
                        }
                      />
                    );
                  })()}

                  {showGst && (
                    <TableCell>
                      {/* h-9 matches the inputs beside it, so the box sits on
                          their centre line and under the heading. */}
                      <div className="flex h-9 items-center justify-center">
                        <Checkbox
                          checked={item.gst}
                          onCheckedChange={(checked) =>
                            onPatch(item.id, { gst: checked === true })
                          }
                          aria-label={`Apply ${tax}, ${rowLabel}`}
                        />
                      </div>
                    </TableCell>
                  )}

                  <TableCell className="text-right font-medium tabular">
                    <div className="flex h-9 items-center justify-end">
                      {formatDocumentMoney(line.amount, currency)}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      // The last remaining row stays, so the table is never empty.
                      disabled={items.length === 1}
                      onClick={() => onRemove(item.id)}
                      aria-label={`Remove ${rowLabel}`}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus />
        Add new item
      </Button>
    </div>
  );
}

/** Drops anything typed past `max` places after the decimal point. */
function limitDecimals(value: string, max: number): string {
  const point = value.indexOf(".");
  return point === -1 ? value : value.slice(0, point + 1 + max);
}

/**
 * Numeric fields accept anything typed and show a live error, rather than
 * blocking keystrokes — a deliberate call recorded in the design handoff. The
 * one exception is `maxDecimals`: cents are a hard stop, not an error.
 * Exported so the NDIS table gets the same treatment rather than its own.
 */
export function NumericCell({
  label,
  value,
  error,
  hint,
  prefix,
  suffix,
  maxDecimals,
  inputRef,
  onChange,
  trailing,
}: {
  label: string;
  value: string;
  error?: string;
  /**
   * Guidance shown under the field, e.g. the NDIS catalogue's published
   * price limit for the chosen support. Suppressed while there's an error.
   */
  hint?: string;
  prefix?: string;
  suffix?: string;
  /**
   * Stops typing (or pasting) past this many places after the point — the
   * extra digits never reach the field. Money fields set it; quantity doesn't.
   */
  maxDecimals?: number;
  inputRef: (node: HTMLElement | null) => void;
  onChange: (value: string) => void;
  /** A control shown beside the field itself — the discount's %/$ picker. */
  trailing?: React.ReactNode;
}) {
  return (
    <TableCell>
      <div
        className={cn(
          "flex items-center gap-1.5",
          // One box: the input and its %/$ picker share a single border.
          trailing &&
            "gap-0 overflow-hidden rounded-md border border-input bg-transparent shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring",
          trailing &&
            error &&
            "border-destructive focus-within:ring-destructive",
        )}
      >
        {/* The prefix sits beside the value, not over it, so a long symbol
            ("NZ$", "AED") can't run into the number. With a trailing picker
            the surrounding box already carries the border. */}
        <PrefixInput
          ref={inputRef}
          prefix={prefix}
          suffix={
            suffix ? (
              <span className="text-sm text-muted-foreground">{suffix}</span>
            ) : undefined
          }
          wrapperClassName={cn(
            // min-w-0: a flex item won't shrink below its content's natural
            // width otherwise, which pushes a trailing control out of the cell.
            "min-w-0 flex-1",
            trailing &&
              "border-0 bg-transparent shadow-none focus-within:ring-0",
          )}
          className="text-right tabular"
          inputMode="decimal"
          value={value}
          onChange={(event) =>
            onChange(
              maxDecimals === undefined
                ? event.target.value
                : limitDecimals(event.target.value, maxDecimals),
            )
          }
          aria-label={label}
          aria-invalid={!!error}
        />
        {trailing}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </TableCell>
  );
}
