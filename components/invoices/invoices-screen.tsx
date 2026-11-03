"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
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
import { useInvoicesQuery } from "@/hooks/use-invoices-query";
import {
  invoiceBulkOpenAtom,
  invoicesQueryAtom,
  invoicesTabAtom,
} from "@/lib/atoms";
import { INVOICE_STATUSES } from "@/lib/invoices";
import { useAreaFilter } from "@/components/documents/area-filter";
import { useInvoicesStore } from "@/stores/invoices";

export function InvoicesScreen() {
  const setBulkOpen = useSetAtom(invoiceBulkOpenAtom);
  const query = useInvoicesQuery();
  // Hydrates the shared contacts store so the "Filter invoices" panel's
  // Clients picker has options the moment this screen loads, rather than
  // only once the Contacts page happens to have been visited first —
  // sole-webapp's own InvoiceList.js fetches its client list the same way,
  // unconditionally on mount (`?filter_by[type]=client&page_size=1000`).
  useContactsQuery("Client", 1, 1000, "");
  const invoices = useInvoicesStore((state) => state.invoices);
  const hydrated = useInvoicesStore((state) => state.hydrated);
  const [tab, setTab] = useAtom(invoicesTabAtom);
  const search = useAtomValue(invoicesQueryAtom);
  const area = useAreaFilter();

  const loading = !hydrated && query.isLoading;
  /*
   * The account genuinely has no invoices — loaded, not errored, and not
   * narrowed by a tab, search or area link — so the summary goes and the
   * table is left showing only its own empty state.
   */
  const hasNoInvoices =
    query.isSuccess &&
    query.data.length === 0 &&
    tab === "All" &&
    !search.trim() &&
    !area;
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
        Each half loads on its own: the summary's own `fetchInvoices()` call
        and the table's own paginated fetch fire together rather than one
        waiting on the other, so a slow summary can't hold up rows whose
        request already finished.
      */}
      {!hasNoInvoices && (
        <InvoicesSummary invoices={invoices} loading={loading} />
      )}
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
