"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatInvoiceDate,
  invoiceMoney,
  invoiceTotals,
  lineTotals,
  type InvoiceLineItem,
} from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { useCountryContext } from "@/hooks/use-country-context";
import { taxWord } from "@/lib/country-context";

/**
 * The read-only body of an invoice or quote, matching the Expenses detail dialog:
 * the figure first, then the fields, then the lines.
 *
 * Shared because the two documents differ only in their status set and their
 * second date — the line-item table and the totals maths are the same, and two
 * copies of them would drift.
 */
export function DocumentDetails({
  number,
  client,
  status,
  statusVariant,
  dates,
  description,
  items,
  extraDiscount,
  notes,
  children,
}: {
  number: string;
  client: string;
  status: string;
  statusVariant: "success" | "warning" | "danger" | "secondary" | "default";
  /** Label/value pairs — issued and due, or issued and expiry. */
  dates: { label: string; value: string }[];
  description: string;
  items: InvoiceLineItem[];
  extraDiscount: string;
  notes: string;
  /** Anything the document type adds: a deposit, attachments, a claim header. */
  children?: React.ReactNode;
}) {
  // The tax is named by the business's country: GST here, VAT in South Africa.
  const tax = taxWord(useCountryContext().country);
  const totals = invoiceTotals(items, extraDiscount);
  const billable = items.filter((item) => lineTotals(item).amount > 0);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium tabular">{number}</p>
          <Badge variant={statusVariant}>{status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{client || "—"}</p>
        <p className="text-2xl font-semibold tracking-tight tabular">
          {invoiceMoney(totals.total)}
        </p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
        {dates.map((date) => (
          <div key={date.label} className="space-y-1">
            <dt className="text-xs text-muted-foreground">{date.label}</dt>
            <dd className="text-sm tabular">
              {date.value ? formatInvoiceDate(date.value) : "—"}
            </dd>
          </div>
        ))}
      </dl>

      {/* Lines with nothing billable on them are left out: an empty row the
          editor keeps for typing into isn't part of the document. */}
      {billable.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="w-[64px] text-right">Qty</TableHead>
                <TableHead className="w-[110px] text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billable.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-[220px]">
                    <span className="block truncate">{item.description}</span>
                    {!item.gst && (
                      <span className="text-xs text-muted-foreground">
                        no GST
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">
                    {item.quantity || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {invoiceMoney(lineTotals(item).amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <dl className="space-y-1.5 rounded-lg border border-dashed border-border surface-subtle p-3 text-sm">
        <TotalRow label="Subtotal" value={totals.subtotal} />
        {totals.discountTotal > 0 && (
          <TotalRow label="Line discounts" value={-totals.discountTotal} />
        )}
        {totals.extra > 0 && (
          <TotalRow label="Invoice discount" value={-totals.extra} />
        )}
        <TotalRow label={tax} value={totals.gstTotal} />
        <TotalRow label="Total" value={totals.total} strong />
      </dl>

      {children}

      {notes.trim() && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Notes</p>
          <p className="whitespace-pre-line text-sm leading-relaxed">{notes}</p>
        </div>
      )}
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("text-muted-foreground", strong && "text-foreground")}>
        {label}
      </dt>
      <dd className={cn("tabular", strong && "font-semibold")}>
        {invoiceMoney(value)}
      </dd>
    </div>
  );
}

/** One label/value pair, for the extras each document type adds. */
export function DetailRow({
  label,
  value,
  tabular,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", tabular && "tabular")}>{value}</dd>
    </div>
  );
}
