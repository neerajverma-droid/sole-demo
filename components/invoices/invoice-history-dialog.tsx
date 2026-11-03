"use client";

import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { historyInvoiceIdAtom } from "@/lib/atoms";
import {
  fetchInvoiceHistory,
  formatTimelineDateTime,
  type InvoiceHistoryEvent,
} from "@/lib/invoice-history";
import { formatDateLabel, formatDocumentMoney } from "@/lib/invoices";
import { useBusinessTimeZone } from "@/hooks/use-active-business";
import { cn } from "@/lib/utils";

/**
 * The audit trail for one invoice — mirrors sole-webapp's
 * StandardInvoiceHistory / DepositInvoiceHistory, folded into a single
 * component since the two differ only in a handful of deposit-only figures.
 */
export function InvoiceHistoryDialog() {
  const [invoiceId, setInvoiceId] = useAtom(historyInvoiceIdAtom);

  const query = useQuery({
    queryKey: ["invoice-history", invoiceId],
    queryFn: () => fetchInvoiceHistory(invoiceId as string),
    enabled: invoiceId !== null,
  });
  const history = query.data;
  const money = (value: number) =>
    formatDocumentMoney(value, history?.currencyCode);

  return (
    <Dialog
      open={invoiceId !== null}
      onOpenChange={(open) => !open && setInvoiceId(null)}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invoice history</DialogTitle>
          <DialogDescription>
            {history?.invoiceNo ?? "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {query.isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading history…
          </div>
        )}

        {query.isError && (
          <p className="py-6 text-center text-sm text-destructive">
            {query.error instanceof Error
              ? query.error.message
              : "Couldn't load that invoice's history."}
          </p>
        )}

        {history && (
          <div className="space-y-6">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap gap-4">
                  <Figure label="Total" value={money(history.totalAmount)} />
                  <Figure
                    label="Paid"
                    value={money(history.totalAllocatedAmount)}
                  />
                  <Figure
                    label="Remaining"
                    value={money(history.remainingAmount)}
                  />
                  {history.historyType === "deposit" &&
                    history.depositPaidAmount !== null && (
                      <Figure
                        label="Deposit paid"
                        value={money(history.depositPaidAmount)}
                      />
                    )}
                </div>

                <div className="shrink-0 space-y-1 text-right">
                  <Badge variant="secondary">
                    {history.historyType === "deposit"
                      ? "Deposit invoice"
                      : "Standard invoice"}
                  </Badge>
                  {history.recipientName && (
                    <div>
                      <p className="text-sm font-medium">
                        {history.recipientName}
                      </p>
                      {history.recipientEmail && (
                        <p className="text-xs text-muted-foreground">
                          {history.recipientEmail}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <ol className="space-y-0">
              {history.timeline.map((event, index) => (
                <TimelineRow
                  key={event.key}
                  event={event}
                  money={money}
                  last={index === history.timeline.length - 1}
                />
              ))}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular">{value}</p>
    </div>
  );
}

function TimelineRow({
  event,
  money,
  last,
}: {
  event: InvoiceHistoryEvent;
  money: (value: number) => string;
  last: boolean;
}) {
  const completed = event.status === "completed";
  const pending = event.status === "pending";
  const timeZone = useBusinessTimeZone();

  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center pt-1">
        <div
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
            completed
              ? "border-primary bg-primary"
              : pending
                ? "border-primary/50 bg-background"
                : "border-border bg-background",
          )}
        >
          {completed && <Check className="size-3 text-primary-foreground" />}
        </div>
        {!last && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>

      <div className={cn("flex-1 pb-6", last && "pb-0")}>
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            !completed && "text-muted-foreground",
          )}
        >
          {event.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {event.occurredAt
            ? formatTimelineDateTime(event.occurredAt, timeZone)
            : completed
              ? "—"
              : pending
                ? "Pending"
                : "Upcoming"}
        </p>

        {(event.amount !== null || (event.paymentCount ?? 0) > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {event.amount !== null && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Amount: {money(event.amount)}
              </span>
            )}
            {event.remainingAmount !== null && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Remaining: {money(event.remainingAmount)}
              </span>
            )}
          </div>
        )}

        {event.sentTo.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {event.sentTo.map((email) => (
              <span
                key={email}
                className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {email}
              </span>
            ))}
          </div>
        )}

        {event.payments.length > 0 && (
          <div className="mt-3 space-y-2">
            {event.payments.map((payment, index) => (
              <div
                key={`${event.key}-${index}`}
                className="rounded-lg border bg-muted/40 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground tabular">
                    {money(payment.amount)}
                  </span>
                  {payment.date && (
                    <span>Date: {formatDateLabel(payment.date)}</span>
                  )}
                  {payment.method && <span>Method: {payment.method}</span>}
                </div>
                {payment.description && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {payment.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
