"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { BulkImportDialog } from "@/components/bulk/bulk-import-dialog";
import { invoiceBulkOpenAtom } from "@/lib/atoms";
import { invoiceImportSpec, invoicePayloads } from "@/lib/invoice-import";
import { createBulkInvoices } from "@/lib/bulk-records";
import type { BulkRow } from "@/lib/bulk-import";
import { useBulkImportCountry } from "@/hooks/use-bulk-import-country";

/**
 * Invoice bulk upload.
 *
 * Nothing on screen lives here — `BulkImportDialog` renders the whole wizard
 * from `invoiceImportSpec`, the same one Contacts, Expenses and Assets
 * render. This file is the things that are actually invoice-specific: where
 * the rows go, what to refetch once they've gone, and the business's country
 * — its word for the tax and the currency a new client starts in.
 */
export function InvoiceBulkUploadDialog() {
  const [open, setOpen] = useAtom(invoiceBulkOpenAtom);
  const queryClient = useQueryClient();
  const country = useBulkImportCountry();
  const spec = React.useMemo(() => invoiceImportSpec(country), [country]);

  const importInvoices = useMutation({
    mutationFn: (rows: BulkRow[]) =>
      createBulkInvoices(invoicePayloads(rows, country)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-status-counts"] });
    },
  });

  return (
    <BulkImportDialog
      spec={spec}
      open={open}
      onOpenChange={setOpen}
      onImport={(rows) => importInvoices.mutateAsync(rows)}
    />
  );
}
