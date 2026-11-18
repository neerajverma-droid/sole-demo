"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { FileText, Plus, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { InvoiceBulkUploadDialog } from "@/components/invoices/bulk-upload-dialog";
import { DeleteInvoiceDialog } from "@/components/invoices/delete-invoice-dialog";
import { MatchTransactionDialog } from "@/components/invoices/match-transaction-dialog";
import { UnmatchInvoiceDialog } from "@/components/invoices/unmatch-invoice-dialog";
import { InvoicePreviewDialog } from "@/components/invoices/invoice-preview-dialog";
import { InvoiceHistoryDialog } from "@/components/invoices/invoice-history-dialog";
import { CashPaymentDialog } from "@/components/invoices/cash-payment-dialog";
import { StopRecurringInvoiceDialog } from "@/components/invoices/stop-recurring-invoice-dialog";
import {
  AttachInvoiceDialog,
} from "@/components/invoices/invoice-dialogs";
import { InvoicesSummary } from "@/components/invoices/invoices-summary";
import { InvoicesTable } from "@/components/invoices/invoices-table";
import { useContactsQuery } from "@/hooks/use-contacts-query";
import { useInvoiceSummaryStatsQuery } from "@/hooks/use-invoice-summary-stats-query";
import {
  invoiceBulkOpenAtom,
  invoicesTabAtom,
} from "@/lib/atoms";
import { INVOICE_STATUSES } from "@/lib/invoices";

export function InvoicesScreen() {
  const setBulkOpen = useSetAtom(invoiceBulkOpenAtom);
  // The card's figures come from the server's stats and the table loads its own
  // page. The row dialogs use that page's rows (`listedInvoicesAtom`), so this
  // screen no longer fetches the 200-invoice list at all.
  const statsQuery = useInvoiceSummaryStatsQuery();
  // Hydrates the shared contacts store so the "Filter invoices" panel's
  // Clients picker has options the moment this screen loads, rather than
  // only once the Contacts page happens to have been visited first —
  // sole-webapp's own InvoiceList.js fetches its client list the same way,
  // unconditionally on mount (`?filter_by[type]=client&page_size=1000`).
  useContactsQuery("Client", 1, 1000, "");
  const [, setTab] = useAtom(invoicesTabAtom);

  const loading = statsQuery.isLoading;
  const searchParams = useSearchParams();

  // Deep link from the Dashboard's "N invoices overdue" row.
  const statusParam = searchParams?.get("status");
  React.useEffect(() => {
    if (!statusParam) return;
    const match = INVOICE_STATUSES.find(
      (status) => status.toLowerCase() === statusParam.toLowerCase(),
    );
    if (match) setTab(match);
  }, [statusParam, setTab]);

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={FileText}
        title="Invoices"
        description="Create, send and track invoices — and see what's still owed at a glance."
      >

        {/* Same pairing as the Contacts header: the bulk route sits beside
            the single-record one rather than only on the migration page. */}
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          <Upload />
          Bulk upload
        </Button>
        <Button asChild data-usertour="invoice-new-button">
          <Link href="/invoices/new">
            <Plus />
            New invoice
          </Link>
        </Button>
      </PageHeader>

      {/*
        Each half loads on its own: the summary's server-side stats request
        and the table's own paginated fetch fire together rather than one
        waiting on the other, so a slow summary can't hold up rows whose
        request already finished. It stays for an account with no invoices
        yet too, its zeroes the first thing to fill in.
      */}
      <InvoicesSummary stats={statsQuery.data} loading={loading} />
      <InvoicesTable />
      <InvoicePreviewDialog />
      <AttachInvoiceDialog />
      <InvoiceBulkUploadDialog />
      <DeleteInvoiceDialog />
      {/* Opened by either Match variant on a row. */}
      <MatchTransactionDialog />
      <UnmatchInvoiceDialog />
      <InvoiceHistoryDialog />
      <CashPaymentDialog />
      <StopRecurringInvoiceDialog />
    </div>
  );
}
