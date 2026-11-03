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
import { StepFooter, StepHeader, useTouched } from "@/components/proposals/steps/step-parts";
import {
  formatProposalMoney,
  hasServiceIssues,
  nonNegative,
  newServiceLine,
  recalculateLine,
  round2,
  serviceTotals,
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

  return (
    <section className="space-y-4">
      <StepHeader
        title="Services"
        description={`Add service lines with quantity, price, discount, and ${tax.name}.`}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange([
                ...services,
                newServiceLine(tax.enabledByDefault ? tax.percent : 0),
              ])
            }
          >
            <Plus />
            Add row
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table className="min-w-[640px]">
          <TableHeader>
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
              services.map((service, index) => (
                <TableRow key={index} className="align-top">
                  <TableCell>
                    <Input
                      value={service.description}
                      placeholder="Service description"
                      aria-label="Description"
                      aria-invalid={Boolean(rowIssue(index, "description"))}
                      onChange={(event) => update(index, { description: event.target.value })}
                    />
                    <CellError message={rowIssue(index, "description")} />
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="text-right font-medium tabular">
                    <span className="inline-flex h-9 items-center">
                      {formatProposalMoney(service.amount, currency)}
                    </span>
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {show("services") && issues.services && (
        <p className="text-xs text-destructive">{issues.services}</p>
      )}

      <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
        <TotalRow label="Subtotal" value={formatProposalMoney(totals.subtotal, currency)} />
        {totals.discount > 0 && (
          <TotalRow
            label="Discount"
            value={`-${formatProposalMoney(totals.discount, currency)}`}
            valueClass="text-destructive"
          />
        )}
        <TotalRow label={tax.name} value={formatProposalMoney(totals.gst, currency)} />
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="font-medium">Total</span>
          <span className="text-base font-semibold tabular">
            {formatProposalMoney(totals.total, currency)}
          </span>
        </div>
      </div>

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

      <StepFooter saving={saving} nextLabel="Payments" onSave={save} />
    </section>
  );
}

/** Typing a sign or exponent into a money/qty field is never meant. */
function blockSignKeys(event: React.KeyboardEvent<HTMLInputElement>) {
  if (["-", "+", "e", "E"].includes(event.key)) event.preventDefault();
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
