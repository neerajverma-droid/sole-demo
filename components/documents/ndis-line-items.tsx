"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DatePicker } from "@/components/documents/date-picker";
import { Required } from "@/components/documents/field";
import { ItemLookupInput } from "@/components/documents/item-lookup-input";
import { NumericCell } from "@/components/documents/line-items";
import { QtyTypeSelect } from "@/components/documents/qty-type-select";
import {
  DEFAULT_DISCOUNT_TYPE,
  DEFAULT_NDIS_CLAIM_TYPE,
  GST_PERCENT,
  NDIS_CLAIM_TYPES,
  currencySymbol,
  formatDocumentMoney,
  lineItemErrors,
  lineTotals,
  type DiscountType,
  type DocumentCurrency,
  type InvoiceLineItem,
  type NdisClaimType,
} from "@/lib/invoices";
import {
  CurrencyCell,
  CurrencyHead,
} from "@/components/documents/currency-cell";
import {
  lineItemPatchFromSuggestion,
  searchInvoiceItems,
} from "@/lib/invoice-item-search";
import { cn } from "@/lib/utils";
import { useCountryContext } from "@/hooks/use-country-context";
import { taxWord } from "@/lib/country-context";

/**
 * The line-item table for an NDIS claim. Only the columns differ from the
 * general table — a support carries its catalogue number and claim type, and is
 * billed in hours — so the maths, the numeric-input treatment and the totals
 * panel below it are all the shared ones.
 */
export function NdisLineItems({
  items,
  onPatch,
  onRemove,
  onAdd,
  register,
  issueFor,
  gstPercent = GST_PERCENT,
  currency: currencyProp,
  clientCurrency = null,
  convertCurrency = false,
  onConvertCurrencyChange,
}: {
  items: InvoiceLineItem[];
  onPatch: (id: string, patch: Partial<InvoiceLineItem>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  /** Registers a focus target so submit can jump to the first error. */
  register: (key: string) => (node: HTMLElement | null) => void;
  /** The editor's `edited`-gated lookup, for the claim-specific errors. */
  issueFor: (key: string) => string | undefined;
  /** The business's own GST rate, for the rare support line that carries GST. */
  gstPercent?: number;
  /** What the prices on this claim are written in. */
  currency?: DocumentCurrency;
  /** The client's own currency — a foreign one is what reveals the column. */
  clientCurrency?: DocumentCurrency | null;
  convertCurrency?: boolean;
  onConvertCurrencyChange?: (value: boolean) => void;
}) {
  // The tax is named by the business's country: GST here, VAT in South Africa.
  const { country } = useCountryContext();
  const tax = taxWord(country);
  // The business's own currency unless the document is written in another.
  const currency = currencyProp ?? country.currency;
  const symbol = currencySymbol(currency);
  const showCurrency =
    !!clientCurrency &&
    clientCurrency !== country.currency &&
    !!onConvertCurrencyChange;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <Table className={showCurrency ? "min-w-[1620px]" : "min-w-[1510px]"}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[190px]">
                Support item number
                <Required />
              </TableHead>
              <TableHead className="text-center">
                Support item name
                <Required />
              </TableHead>
              <TableHead className="w-[190px] text-center">Claim type</TableHead>
              <TableHead className="w-[150px] text-center">Date</TableHead>
              <TableHead className="w-[110px] text-center">
                Hours / qty
                <Required />
              </TableHead>
              <TableHead className="w-[110px] text-center">Unit</TableHead>
              <TableHead className="w-[130px] text-center">
                Unit price
                <Required />
              </TableHead>
              {showCurrency && <CurrencyHead />}
              <TableHead className="w-[170px] text-center">Discount</TableHead>
              <TableHead className="w-[70px] text-center">{tax}</TableHead>
              <TableHead className="w-[130px] text-right">Amount</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const errors = lineItemErrors(item);
              const line = lineTotals(item, gstPercent);
              const rowLabel = `support ${index + 1}`;
              const numberIssue = issueFor(`item-${item.id}-supportItemNumber`);

              return (
                <TableRow key={item.id} className="align-top">
                  <TableCell>
                    <Input
                      ref={register(`item-${item.id}-supportItemNumber`)}
                      className={cn(
                        "h-9 tabular",
                        numberIssue &&
                          "border-destructive focus-visible:ring-destructive",
                      )}
                      value={item.supportItemNumber ?? ""}
                      onChange={(event) =>
                        onPatch(item.id, {
                          supportItemNumber: event.target.value,
                        })
                      }
                      placeholder="01_011_0107_1_1"
                      aria-label={`Support item number, ${rowLabel}`}
                      aria-invalid={!!numberIssue}
                    />
                    {numberIssue && (
                      <p className="mt-1 text-xs text-destructive">
                        {numberIssue}
                      </p>
                    )}
                  </TableCell>

                  <TableCell>
                    {/* Picking from the catalogue is what fills the support
                        item number beside it — the one field on this row
                        nobody can reasonably type from memory. */}
                    <ItemLookupInput
                      search={(query) => searchInvoiceItems(query, true)}
                      queryKey="ndis"
                      emptyLabel="No matching support items — type the description yourself."
                      inputRef={register(`item-${item.id}-description`)}
                      value={item.description}
                      onChange={(value) =>
                        onPatch(item.id, { description: value })
                      }
                      onSelect={(suggestion) =>
                        onPatch(
                          item.id,
                          lineItemPatchFromSuggestion(suggestion, item, {
                            ndis: true,
                            gstDefault: false,
                          }),
                        )
                      }
                      className="text-center"
                      placeholder="Search the NDIS support catalogue"
                      label={`Support item name, ${rowLabel}`}
                    />
                  </TableCell>

                  <TableCell>
                    <Select
                      value={item.claimType ?? DEFAULT_NDIS_CLAIM_TYPE}
                      onValueChange={(value) =>
                        onPatch(item.id, {
                          claimType: value as NdisClaimType,
                        })
                      }
                    >
                      <SelectTrigger
                        className="h-9 [&>span]:flex-1 [&>span]:text-center"
                        aria-label={`Claim type, ${rowLabel}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NDIS_CLAIM_TYPES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell>
                    <DatePicker
                      value={item.date ?? ""}
                      onChange={(iso) => onPatch(item.id, { date: iso })}
                      label={`Service date, ${rowLabel}`}
                    />
                  </TableCell>

                  <NumericCell
                    label={`Hours or quantity, ${rowLabel}`}
                    value={item.quantity}
                    error={errors.quantity}
                    inputRef={register(`item-${item.id}-quantity`)}
                    onChange={(value) => onPatch(item.id, { quantity: value })}
                  />

                  <TableCell>
                    <QtyTypeSelect
                      value={item.qtyType}
                      onChange={(qtyType) => onPatch(item.id, { qtyType })}
                      label={`Unit, ${rowLabel}`}
                    />
                  </TableCell>

                  <NumericCell
                    label={`Unit price, ${rowLabel}`}
                    value={item.price}
                    error={errors.price}
                    // The catalogue publishes a regional price limit rather
                    // than a price, so it's shown as guidance under the field.
                    hint={item.priceHint}
                    prefix={symbol}
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
                    return (
                      <NumericCell
                        label={`Discount ${discountType === "amount" ? "amount" : "percent"}, ${rowLabel}`}
                        value={item.discountPercent}
                        error={errors.discountPercent}
                        inputRef={register(`item-${item.id}-discountPercent`)}
                        onChange={(value) =>
                          onPatch(item.id, { discountPercent: value })
                        }
                        trailing={
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
                        }
                      />
                    );
                  })()}

                  <TableCell>
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus />
          Add support item
        </Button>
        <p className="text-xs text-muted-foreground">
          NDIS supports are GST-free by default — tick GST for a line that
          carries it, such as a retail purchase being reimbursed.
        </p>
      </div>
    </div>
  );
}
