"use client";

import * as React from "react";
import { AlertTriangle, FileText, Newspaper, Send } from "lucide-react";
import { toast } from "sonner";

import {
  CardAddButton,
  CardRow,
  CardRows,
  RowAction,
  Segmented,
  SubTabs,
  UniboxCard,
} from "@/components/actions/unibox/unibox-ui";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRefreshUnibox, useUniboxQuery } from "@/hooks/use-unibox-query";
import { apiErrorMessage } from "@/lib/api-error";
import { runGetPaidAction } from "@/lib/unibox-actions";
import { isDemoRow, showSampleNotice } from "@/lib/unibox-demo";
import { type UniboxInvoice, type UniboxQuote } from "@/lib/unibox";
import {
  CARD_ROW_LIMIT,
  GET_PAID_GROUPS,
  GET_PAID_SUCCESS,
  INVOICE_TABS,
  QUOTE_TABS,
  getPaidSets,
  invoiceAction,
  invoiceSub,
  invoiceTitle,
  optionalMoney,
  quoteAction,
  quoteIdOf,
  quoteSub,
  quoteTitle,
  type GetPaidAction,
  type GetPaidGroup,
  type InvoiceTab,
  type QuoteTab,
} from "@/lib/unibox-rules";

export function GetPaidCard() {
  const refresh = useRefreshUnibox();
  const invoicesQuery = useUniboxQuery("invoices");
  const quotesQuery = useUniboxQuery("quotes");
  const loading = invoicesQuery.isLoading || quotesQuery.isLoading;

  const [group, setGroup] = React.useState<GetPaidGroup>("Invoice");
  const [invoiceTab, setInvoiceTab] = React.useState<InvoiceTab>("To send");
  const [quoteTab, setQuoteTab] = React.useState<QuoteTab>("To send");
  const [pending, setPending] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const now = Date.now();
  const { invoices: invoiceSets, quotes: quoteSets, invoiceCounts, quoteCounts, groupCounts, total } =
    getPaidSets(invoicesQuery.data ?? [], quotesQuery.data ?? [], now);

  const run = async (kind: "invoice" | "quote", item: UniboxInvoice | UniboxQuote, action: GetPaidAction) => {
    if (isDemoRow(item)) {
      showSampleNotice();
      return;
    }
    const quoteId = quoteIdOf(item as UniboxQuote);
    const id = kind === "quote" ? quoteId : item.id;
    const pendingId = `${kind}:${id}:${action.key}`;
    setPending(pendingId);
    try {
      const message = await runGetPaidAction(action.key, item);
      toast.success(message || GET_PAID_SUCCESS[action.key]);
      await refresh("invoices", "quotes", "priorities", "progress");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Unable to complete this action."));
    } finally {
      setPending(null);
    }
  };

  const rows =
    group === "Quote"
      ? quoteSets[quoteTab].slice(0, CARD_ROW_LIMIT).map((quote, index) => {
          const action = quoteAction(quote);
          const pendingId = action ? `quote:${quoteIdOf(quote)}:${action.key}` : "";
          return (
            <CardRow
              key={`quote-${quote.id}`}
              tourId={index === 0 ? "quick-actions-get-paid-row" : undefined}
              icon={FileText}
              title={quoteTitle(quote)}
              sub={quoteSub(quote)}
              amount={optionalMoney(quote.total)}
              action={
                action ? (
                  <RowAction
                    label={action.label}
                    busy={pending === pendingId}
                    onClick={() => run("quote", quote, action)}
                  />
                ) : null
              }
            />
          );
        })
      : invoiceSets[invoiceTab].slice(0, CARD_ROW_LIMIT).map((invoice, index) => {
          const late = invoiceTab === "Overdue";
          const action = invoiceAction(invoiceTab);
          return (
            <CardRow
              key={`invoice-${invoice.id}`}
              tourId={index === 0 ? "quick-actions-get-paid-row" : undefined}
              icon={late ? AlertTriangle : invoiceTab === "To send" ? Send : FileText}
              iconTone={late ? "bg-destructive/10 text-destructive" : undefined}
              title={invoiceTitle(invoice)}
              sub={invoiceSub(invoice, invoiceTab, now)}
              subTone={late ? "text-destructive font-medium" : undefined}
              amount={optionalMoney(invoice.total)}
              action={
                <RowAction
                  label={action.label}
                  busy={pending === `invoice:${invoice.id}:${action.key}`}
                  onClick={() => run("invoice", invoice, action)}
                />
              }
            />
          );
        });

  return (
    <UniboxCard
      icon={Newspaper}
      title="Get paid"
      tourId="quick-actions-get-paid"
      sample={invoicesQuery.isDemo || quotesQuery.isDemo}
      count={total}
      loading={loading}
      action={<CardAddButton label="New" onClick={() => setCreating(true)} />}
    >
      <div>
        <Segmented label="Invoices or quotes" options={GET_PAID_GROUPS} value={group} onChange={setGroup} counts={groupCounts} />
      </div>
      {group === "Invoice" ? (
        <SubTabs
          label="Invoices"
          options={INVOICE_TABS}
          value={invoiceTab}
          onChange={setInvoiceTab}
          counts={invoiceCounts}
        />
      ) : (
        <SubTabs label="Quotes" options={QUOTE_TABS} value={quoteTab} onChange={setQuoteTab} counts={quoteCounts} />
      )}
      {/* Remounted per tab: switching tabs is a different list, not every row
          leaving at once. */}
      <CardRows
        key={group === "Invoice" ? `invoice:${invoiceTab}` : `quote:${quoteTab}`}
        loading={loading}
        empty={rows.length === 0}
        emptyText="No items"
      >
        {rows}
      </CardRows>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="flex max-h-[92svh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl lg:max-w-6xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>New invoice</DialogTitle>
            <DialogDescription>Create an invoice without leaving Quick Actions.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {creating ? (
              <InvoiceEditor
                embedded
                onClose={() => setCreating(false)}
                onSaved={async () => {
                  setCreating(false);
                  await refresh("invoices", "quotes", "priorities");
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </UniboxCard>
  );
}
