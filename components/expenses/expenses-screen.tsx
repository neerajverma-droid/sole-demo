"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Mail, Plus, Receipt, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ExpenseBulkUploadDialog } from "@/components/expenses/bulk-upload-dialog";
import { EmailReceiptsDialog } from "@/components/expenses/email-receipts-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoicePreviewDialog } from "@/components/invoices/invoice-preview-dialog";
import { MatchExpenseDialog } from "@/components/expenses/match-expense-dialog";
import { UnmatchExpenseDialog } from "@/components/expenses/unmatch-expense-dialog";
import { DeleteExpenseDialog } from "@/components/expenses/delete-expense-dialog";
import {
  AttachReceiptDialog,
  ExpenseDetailsDialog,
} from "@/components/expenses/expense-dialogs";
import { ConvertToInvoiceDialog } from "@/components/expenses/convert-to-invoice-dialog";
import { ExpensesSummary } from "@/components/expenses/expenses-summary";
import {
  DEFAULT_PAGE_SIZE,
  ExpensesTable,
} from "@/components/expenses/expenses-table";
import { MatchDialog } from "@/components/expenses/match-dialog";
import { ShiftFinanceBanner } from "@/components/expenses/shift-finance-banner";
import {
  useExpenseSummaryQuery,
  useExpensesListQuery,
} from "@/hooks/use-expenses-query";
import {
  expenseBulkOpenAtom,
  expensePeriodAtom,
  expenseSortAtom,
  expensesQueryAtom,
} from "@/lib/atoms";
import { EXPENSE_PERIODS, type ExpensePeriod } from "@/lib/expenses";
import { useCreateIntent } from "@/lib/use-create-intent";

/** The copy the real platform shows beside the title. */
const EXPENSES_TIP =
  "Expenses are items you purchase in order to run your business. Your accountant uses these to maximise your tax return — for example supplies or protective clothing.";

export function ExpensesScreen() {
  const setBulkOpen = useSetAtom(expenseBulkOpenAtom);
  const [emailReceiptsOpen, setEmailReceiptsOpen] = React.useState(false);

  // Deep link from the BAS review: land on the list already searched for the
  // expense a finding is about. The search box shows it, so it can be cleared.
  const setExpenseQuery = useSetAtom(expensesQueryAtom);
  const searchParam = useSearchParams()?.get("search");
  React.useEffect(() => {
    if (searchParam?.trim()) setExpenseQuery(searchParam.trim());
  }, [searchParam, setExpenseQuery]);
  const router = useRouter();
  const createIntent = useCreateIntent();
  const [period, setPeriod] = useAtom(expensePeriodAtom);
  const summaryQuery = useExpenseSummaryQuery(period);

  /*
   * The table's own unfiltered first page — same key, so it's the cached
   * response rather than a second fetch. Once it has genuinely loaded with
   * nothing in it, the period tabs, stat cards and banner all go, leaving
   * just the header and the table's own empty state. A search still in the
   * box keeps them, so it can be cleared.
   */
  const query = useAtomValue(expensesQueryAtom);
  const sort = useAtomValue(expenseSortAtom);
  const firstPageQuery = useExpensesListQuery(1, DEFAULT_PAGE_SIZE, {
    search: "",
    sort,
  });
  const hasNoExpenses =
    firstPageQuery.isSuccess &&
    firstPageQuery.data.total === 0 &&
    !query.trim();

  // Deep-linked from a "New expense" entry point: open the chooser directly.
  React.useEffect(() => {
    if (createIntent) router.replace("/expenses/new");
  }, [createIntent, router]);

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Receipt}
        title="Expenses"
        titleTip={EXPENSES_TIP}
        description="Track what you spend, match it to your bank feed, and stay ready for tax time."
      >
        {/* Same pairing as the Contacts header: the bulk route sits beside
            the single-record one rather than only on the migration page. */}
        <Button variant="outline" onClick={() => setEmailReceiptsOpen(true)}>
          <Mail />
          Email receipts
        </Button>
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          <Upload />
          Bulk upload
        </Button>
        <Button asChild data-tour="add-expense">
          <Link href="/expenses/new">
            <Plus />
            New expense
          </Link>
        </Button>
      </PageHeader>

      {!hasNoExpenses && (
        <>
          {/* The period only re-queries the analytics cards below — the
              table stays on its own real, paginated listing, same as
              sole-webapp's own screen. */}
          <Tabs
            value={period}
            onValueChange={(next) => setPeriod(next as ExpensePeriod)}
          >
            <TabsList
              aria-label="Summary period"
              data-usertour="expense-period"
            >
              {EXPENSE_PERIODS.map((option) => (
                <TabsTrigger key={option} value={option}>
                  {option}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <ExpensesSummary
            period={period}
            summary={summaryQuery.data}
            loading={summaryQuery.isLoading}
          />
          <ShiftFinanceBanner />
        </>
      )}

      <ExpensesTable />

      <ExpenseDetailsDialog />
      <AttachReceiptDialog />
      <ExpenseBulkUploadDialog />
      <EmailReceiptsDialog
        open={emailReceiptsOpen}
        onOpenChange={setEmailReceiptsOpen}
      />
      <DeleteExpenseDialog />
      <MatchExpenseDialog />
      <UnmatchExpenseDialog />
      <MatchDialog />
      {/* Opened by the row menu's Convert to invoice, with the expense
          prefilled — the list stays put behind it, same as sole-webapp's own
          drawer. */}
      <ConvertToInvoiceDialog />
      {/* Opened by the invoice badge on an on-charged expense. */}
      <InvoicePreviewDialog />
    </div>
  );
}
