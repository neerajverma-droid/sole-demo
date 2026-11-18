"use client";

import * as React from "react";
import { Coins, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ItemLookupInput } from "@/components/documents/item-lookup-input";
import { StepFooter, StepHeader, useTouched } from "@/components/proposals/steps/step-parts";
import { searchInvoiceItems } from "@/lib/invoice-item-search";
import {
  formatProposalMoney,
  hasServiceIssues,
  nonNegative,
  newServiceLine,
  recalculateLine,
  round2,
  serviceTotals,
  servicePatchFromSuggestion,
  servicesIssues,
  type ServiceLine,
} from "@/lib/proposals";
import { cn } from "@/lib/utils";

export function ServicesStep({
  services,
  onChange,
  onSave,
  saving,
  currency,
  tax,
  multicurrency,
  rate,
  publishedRate,
  rateEdited,
  onRateChange,
  onRateReset,
}: {
  services: ServiceLine[];
  onChange: (services: ServiceLine[]) => void;
  onSave: () => void;
  saving: boolean;
  currency: string;
  tax: { percent: number; name: string; enabledByDefault: boolean };
  multicurrency: boolean;
  /** 1 AUD = rate <currency>, as it will be saved. */
  rate: number | null;
  publishedRate: number | null;
  rateEdited: boolean;
  onRateChange: (rate: number | null) => void;
  onRateReset: () => void;
}) {
  const { show, submit } = useTouched();
  const issues = servicesIssues(services);
  const totals = serviceTotals(services);
  const rowIssue = (index: number, key: keyof (typeof issues.rows)[number]) =>
    show("services") ? issues.rows[index]?.[key] : undefined;

  const update = (index: number, patch: Partial<ServiceLine>) =>
    onChange(
      services.map((service, at) =>
        at === index ? recalculateLine({ ...service, ...patch }) : service,
      ),
    );

  const save = () => {
    submit();
    if (hasServiceIssues(issues)) return;
    onSave();
  };

  const home =
    multicurrency && rate && rate > 0
      ? {
          subtotal: round2(totals.subtotal / rate),
          discount: round2(totals.discount / rate),
          gst: round2(totals.gst / rate),
          total: round2(totals.total / rate),
        }
      : null;

  /** Each line's controls — laid out as a table row from sm, as a card on phones. */
  const lineFields = (service: ServiceLine, index: number) => ({
    description: (
      <>
        <ItemLookupInput
          search={(query) => searchInvoiceItems(query, false)}
          queryKey="invoice"
          value={service.description}
          placeholder="Search or type a service"
          label="Description"
          invalid={Boolean(rowIssue(index, "description"))}
          onChange={(value) => update(index, { description: value })}
          onSelect={(suggestion) => update(index, servicePatchFromSuggestion(suggestion, service, tax.percent))}
        />
        <CellError message={rowIssue(index, "description")} />
      </>
    ),
    quantity: (
      <>
        <Input
          type="number"
          min={0}
          aria-label="Quantity"
          value={service.quantity}
          aria-invalid={Boolean(rowIssue(index, "quantity"))}
          onKeyDown={blockSignKeys}
          onChange={(event) => update(index, { quantity: nonNegative(event.target.value) })}
        />
        <CellError message={rowIssue(index, "quantity")} />
      </>
    ),
    price: (
      <>
        <Input
          type="number"
          min={0}
          aria-label="Price"
          value={service.price}
          aria-invalid={Boolean(rowIssue(index, "price"))}
          onKeyDown={blockSignKeys}
          onChange={(event) => update(index, { price: nonNegative(event.target.value) })}
        />
        <CellError message={rowIssue(index, "price")} />
      </>
    ),
    discount: (
      <>
        <Input
          type="number"
          min={0}
          max={100}
          aria-label="Discount percent"
          value={service.discount_percent ?? 0}
          aria-invalid={Boolean(rowIssue(index, "discount_percent"))}
          onKeyDown={blockSignKeys}
          onChange={(event) =>
            update(index, { discount_percent: nonNegative(event.target.value, 100) })
          }
        />
        <CellError message={rowIssue(index, "discount_percent")} />
      </>
    ),
    tax: (
        <div className="flex h-9 items-center gap-2">
          <Switch
            aria-label={`Apply ${tax.name}`}
            checked={Number(service.gst_percent) > 0}
            onCheckedChange={(checked) =>
              update(index, { gst_percent: checked ? tax.percent : 0 })
            }
          />
          <span className="text-xs text-muted-foreground">
            {Number(service.gst_percent) > 0 ? `${service.gst_percent}%` : "No"}
          </span>
        </div>
    ),
    amount: formatProposalMoney(service.amount, currency),
    remove: (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label="Remove service"
          onClick={() => onChange(services.filter((_, at) => at !== index))}
        >
          <Trash2 className="text-muted-foreground" />
        </Button>
    ),
  });

  return (
    <section className="space-y-4">
      <StepHeader
        title="Services"
        description={`Add service lines with quantity, price, discount, and ${tax.name}.`}
      />

      {/* One card, as sole-pm's: the group's heading, its lines, "Add New Service" and its totals. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border px-4 py-3">
          <h3 className="text-base font-semibold">One-off Services</h3>
          <span className="text-sm text-muted-foreground">· Billed on acceptance</span>
        </div>

        {/* Phones: one card per line, nothing to scroll sideways. */}
        <div className="space-y-3 p-3 sm:hidden">
          {services.length === 0 ? (
            <p className="rounded-lg border border-border py-7 text-center text-sm text-muted-foreground">
              No services added yet.
            </p>
          ) : (
            services.map((service, index) => {
              const field = lineFields(service, index);
              return (
                <div key={index} className="space-y-3 rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">{field.description}</div>
                    {field.remove}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <MobileField label="Qty">{field.quantity}</MobileField>
                    <MobileField label="Price">{field.price}</MobileField>
                    <MobileField label="Discount %">{field.discount}</MobileField>
                    <MobileField label={tax.name}>{field.tax}</MobileField>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-medium tabular">{field.amount}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <Table className="min-w-[640px]">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="w-20">Qty</TableHead>
                <TableHead className="w-28">Price</TableHead>
                <TableHead className="w-24">Discount %</TableHead>
                <TableHead className="w-28">{tax.name}</TableHead>
                <TableHead className="w-28 text-right">Amount</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-7 text-center text-sm text-muted-foreground">
                    No services added yet.
                  </TableCell>
                </TableRow>
              ) : (
                services.map((service, index) => {
                  const field = lineFields(service, index);
                  return (
                    <TableRow key={index} className="align-top">
                      <TableCell>{field.description}</TableCell>
                      <TableCell>{field.quantity}</TableCell>
                      <TableCell>{field.price}</TableCell>
                      <TableCell>{field.discount}</TableCell>
                      <TableCell>{field.tax}</TableCell>
                      <TableCell className="text-right font-medium tabular">
                        <span className="inline-flex h-9 items-center">{field.amount}</span>
                      </TableCell>
                      <TableCell>{field.remove}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border p-3">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
            onClick={() => onChange([...services, newServiceLine(tax.enabledByDefault ? tax.percent : 0)])}
          >
            <Plus className="size-4" aria-hidden />
            Add New Service
          </button>
        </div>

        <div className="flex flex-col gap-2 border-t border-border bg-muted/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            {services.length} {services.length === 1 ? "service" : "services"}
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <FooterTotal label="Subtotal" value={formatProposalMoney(totals.subtotal, currency)} />
            {totals.discount > 0 && (
              <FooterTotal
                label="Discount"
                value={`-${formatProposalMoney(totals.discount, currency)}`}
                valueClass="text-destructive"
              />
            )}
            <FooterTotal label={tax.name} value={formatProposalMoney(totals.gst, currency)} />
            <FooterTotal label="Total" value={formatProposalMoney(totals.total, currency)} valueClass="font-semibold" />
          </div>
        </div>
      </div>
      {show("services") && issues.services && (
        <p className="text-xs text-destructive">{issues.services}</p>
      )}

      {multicurrency && (
        <ExchangePanel
          currency={currency}
          rate={rate}
          publishedRate={publishedRate}
          edited={rateEdited}
          onRateChange={onRateChange}
          onReset={onRateReset}
          home={home}
        />
      )}

      <StepFooter saving={saving} nextLabel="Documents" onSave={save} />
    </section>
  );
}

/** Typing a sign or exponent into a money/qty field is never meant. */
function blockSignKeys(event: React.KeyboardEvent<HTMLInputElement>) {
  if (["-", "+", "e", "E"].includes(event.key)) event.preventDefault();
}

function FooterTotal({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{label}: </span>
      <span className={cn("font-medium tabular", valueClass)}>{value}</span>
    </span>
  );
}

function CellError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-destructive">{message}</p> : null;
}

function TotalRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className={cn("font-medium text-foreground tabular", valueClass)}>{value}</span>
    </div>
  );
}

/**
 * Prices are in the client's currency; this is the rate that converts them
 * back to AUD — today's published one, or the user's own override.
 */
function ExchangePanel({
  currency,
  rate,
  publishedRate,
  edited,
  onRateChange,
  onReset,
  home,
}: {
  currency: string;
  rate: number | null;
  publishedRate: number | null;
  edited: boolean;
  onRateChange: (rate: number | null) => void;
  onReset: () => void;
  home: { subtotal: number; discount: number; gst: number; total: number } | null;
}) {
  const [draft, setDraft] = React.useState(rate != null ? String(rate) : "");
  React.useEffect(() => {
    if (!edited) setDraft(rate != null ? String(rate) : "");
  }, [rate, edited]);

  const parsed = Number(draft);
  const invalid = Boolean(draft.trim()) && (!Number.isFinite(parsed) || parsed <= 0);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
          <Coins className="size-4" aria-hidden />
        </span>
        <p className="text-sm font-medium">Home currency (AUD)</p>
      </div>
      {publishedRate == null && !edited && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Exchange rate for {currency} is not available — set a custom rate before saving.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="proposal-rate" className="text-xs text-muted-foreground">
            1 AUD =
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="proposal-rate"
              inputMode="decimal"
              className="w-32"
              value={draft}
              aria-invalid={invalid}
              onChange={(event) => {
                const cleaned = event.target.value.replace(/[^\d.]/g, "");
                setDraft(cleaned);
                const next = Number(cleaned);
                onRateChange(Number.isFinite(next) && next > 0 ? next : null);
              }}
            />
            <span className="text-sm text-muted-foreground">{currency}</span>
          </div>
        </div>
        {edited && publishedRate != null && (
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw />
            Use today&apos;s rate
          </Button>
        )}
      </div>
      {invalid && <p className="text-xs text-destructive">Enter a rate greater than 0.</p>}
      {home && (
        <div className="space-y-1.5 border-t border-border pt-3 text-sm">
          <TotalRow label="Subtotal" value={formatProposalMoney(home.subtotal, "AUD")} />
          {home.discount > 0 && (
            <TotalRow label="Discount" value={`-${formatProposalMoney(home.discount, "AUD")}`} />
          )}
          <TotalRow label="GST" value={formatProposalMoney(home.gst, "AUD")} />
          <div className="flex items-center justify-between font-medium">
            <span>Total in AUD</span>
            <span className="tabular">{formatProposalMoney(home.total, "AUD")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
