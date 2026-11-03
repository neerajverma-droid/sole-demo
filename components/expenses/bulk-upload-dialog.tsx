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
 * accounts, because an expense's Category column names an account and the
 * backend wants its id. The spec is rebuilt when that list arrives so the
 * "isn't one of your expense accounts" rule can actually fire — and the
 * import is held until it does, since validating a category against an empty
 * list would wave every row through.
 */
export function ExpenseBulkUploadDialog() {
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
      spec={spec}
      open={open}
      onOpenChange={setOpen}
      busy={categoriesQuery.isLoading}
      busyLabel="Loading categories…"
      onImport={(rows) => importExpenses.mutateAsync(rows)}
      reviewFooter={
        categoriesQuery.isError ? (
          <p className="text-xs text-destructive">
            Your chart of accounts could not be loaded, so categories
            can&apos;t be checked against it. Importing now would leave every
            expense uncategorised — close this and try again.
          </p>
        ) : null
      }
    />
  );
}
