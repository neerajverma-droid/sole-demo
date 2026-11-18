"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
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
import { ExpensesTable } from "@/components/expenses/expenses-table";
import { MatchDialog } from "@/components/expenses/match-dialog";
import { ShiftFinanceBanner } from "@/components/expenses/shift-finance-banner";
import { useExpenseSummaryQuery } from "@/hooks/use-expenses-query";
import {
  expenseBulkOpenAtom,
  expensePeriodAtom,
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
  const searchParams = useSearchParams();
  const searchParam = searchParams?.get("search");
  React.useEffect(() => {
    if (searchParam?.trim()) setExpenseQuery(searchParam.trim());
  }, [searchParam, setExpenseQuery]);
  const router = useRouter();

  // Bills used to be a tab here. Old links and bookmarks still land somewhere.
  const legacyBillsTab = searchParams?.get("tab") === "bills";
  React.useEffect(() => {
    if (legacyBillsTab) router.replace("/expenses/bills");
  }, [legacyBillsTab, router]);
  const createIntent = useCreateIntent();
  const [period, setPeriod] = useAtom(expensePeriodAtom);
  const summaryQuery = useExpenseSummaryQuery(period);


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
        <div
          className="flex flex-wrap items-center gap-3"
          data-usertour="expense-add-actions"
        >
          <Button asChild data-tour="add-expense">
            <Link href="/expenses/new">
              <Plus />
              New expense
            </Link>
          </Button>
        </div>
      </PageHeader>

      {/* Stays for an account with no expenses yet too, as on Invoices: the
          same screen it will have later, zeroes and all. */}
      {/* The period only re-queries the analytics cards below — the
          table stays on its own real, paginated listing, same as
          sole-webapp's own screen. */}
      <Tabs
        value={period}
        onValueChange={(next) => setPeriod(next as ExpensePeriod)}
      >
        <TabsList aria-label="Summary period" data-usertour="expense-period">
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
      {/* Opened by the row menu's Convert to invoice: checks for drafts, then
          opens the invoice on its own page with the expense prefilled. */}
      <ConvertToInvoiceDialog />
      {/* Opened by the invoice badge on an on-charged expense. */}
      <InvoicePreviewDialog />
    </div>
  );
}
