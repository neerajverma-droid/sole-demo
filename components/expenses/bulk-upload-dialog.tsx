"use client";

import * as React from "react";
import { useAtom } from "jotai";

import { BulkImportDialog } from "@/components/bulk/bulk-import-dialog";
import { expenseBulkOpenAtom } from "@/lib/atoms";
import { expenseImportSpec } from "@/lib/expense-import";
import { useAccountCategoriesQuery } from "@/hooks/use-account-categories-query";
import { useBulkCreateExpensesMutation } from "@/hooks/use-expenses-query";
import { useBulkImportCountry } from "@/hooks/use-bulk-import-country";

/**
 * Expense bulk upload.
 *
 * The whole wizard is `BulkImportDialog`; what's here is the chart of
 * accounts. It goes to the AI formatter with the file so each row comes back
 * with the id of the category it fits, it fills the Category dropdown on
 * Review, and the backend wants the chosen id. The spec is rebuilt when that
 * list arrives, and the upload waits for it — a file formatted or checked
 * against an empty list would come back with no category on any row.
 */
export function ExpenseBulkUploadDialog({ page = false }: { page?: boolean } = {}) {
  const [open, setOpen] = useAtom(expenseBulkOpenAtom);
  const categoriesQuery = useAccountCategoriesQuery("Expenses");
  const categories = React.useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  );

  const importExpenses = useBulkCreateExpensesMutation(categories);
  // Words the tax column in the business's own term ("VAT included").
  const country = useBulkImportCountry();

  const spec = React.useMemo(
    () => expenseImportSpec(categories, country),
    [categories, country],
  );

  return (
    <BulkImportDialog
      page={page}
      spec={spec}
      open={open}
      onOpenChange={setOpen}
      // Wide enough for the ten Review columns without scrolling sideways.
      contentClassName="sm:max-w-6xl"
      compactIssues
      busy={categoriesQuery.isLoading}
      busyLabel="Loading categories…"
      onImport={(rows) => importExpenses.mutateAsync(rows)}
      reviewFooter={
        categoriesQuery.isError ? (
          <p className="text-xs text-destructive">
            Your chart of accounts could not be loaded, so categories can&apos;t
            be suggested or chosen. Importing now would leave every expense
            uncategorised — close this and try again.
          </p>
        ) : null
      }
    />
  );
}
