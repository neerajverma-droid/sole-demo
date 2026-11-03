"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchInvoices } from "@/lib/invoices";
import { createBulkInvoices } from "@/lib/bulk-records";
import { invoicePayloads } from "@/lib/invoice-import";
import type { BulkRow } from "@/lib/bulk-import";
import { useBulkImportCountry } from "@/hooks/use-bulk-import-country";
import { useInvoicesStore } from "@/stores/invoices";

/**
 * Loads the business's invoices and mirrors them into the shared store, so
 * every screen reading `useInvoicesStore` sees the same live list instead of
 * each holding its own copy. Safe to call from more than one mounted
 * component — React Query dedupes the underlying request.
 */
export function useInvoicesQuery() {
  const setInvoices = useInvoicesStore((state) => state.setInvoices);

  const query = useQuery({
    queryKey: ["invoices"],
    queryFn: fetchInvoices,
  });

  React.useEffect(() => {
    if (query.data) setInvoices(query.data);
  }, [query.data, setInvoices]);

  return query;
}

/**
 * The bulk importer's write. Mirrors `useBulkCreateContactsMutation` — the
 * rows arrive in the engine's generic shape and are converted to the API's
 * own here, at the only boundary where the difference is real.
 */
export function useBulkCreateInvoicesMutation() {
  const queryClient = useQueryClient();
  const country = useBulkImportCountry();
  return useMutation({
    mutationFn: (rows: BulkRow[]) =>
      createBulkInvoices(invoicePayloads(rows, country)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
