"use client";

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { useAtomValue } from "jotai";

import { listedInvoicesAtom } from "@/lib/atoms";
import { fetchInvoiceDetail, fetchInvoices, type Invoice } from "@/lib/invoices";
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
 * Every invoice a row dialog might be asked about: the list's current page first
 * (it's the freshest copy), then whatever the shared store holds from the
 * dashboard's fill.
 */
export function useKnownInvoices(): Invoice[] {
  const stored = useInvoicesStore((state) => state.invoices);
  const listed = useAtomValue(listedInvoicesAtom);

  return React.useMemo(() => {
    const listedIds = new Set(listed.map((invoice) => invoice.id));
    return [...listed, ...stored.filter((invoice) => !listedIds.has(invoice.id))];
  }, [listed, stored]);
}

/**
 * One invoice by id for a row dialog. It is on the page the list is showing in
 * nearly every case; for one that isn't (the linked invoice a converted quote
 * opens from the Quotes screen, which has no invoice list) it is fetched by id.
 * Keyed under `["invoices"]`, so a save, payment or delete refreshes it too.
 */
export function useKnownInvoice(id: string | null): Invoice | undefined {
  const known = useKnownInvoices();
  const found = id ? known.find((invoice) => invoice.id === id) : undefined;

  const fetched = useQuery({
    queryKey: ["invoices", "detail", id],
    queryFn: () => fetchInvoiceDetail(id as string),
    enabled: Boolean(id) && !found,
  });

  return found ?? fetched.data;
}

/**
 * Puts the invoice list back to "not loaded yet".
 *
 * Invalidating isn't enough when a save is about to land the user on the list:
 * the page it cached last time is still there, so it renders at once, stale,
 * and the new invoice pops in whenever the quiet refetch finishes — the list
 * never looks like it is loading. Resetting drops that cached data (the table,
 * the status tabs and the summary cards alike) so the list opens on its
 * skeleton, and clears the store's `hydrated` flag, which is what the summary
 * cards check before showing theirs.
 */
export function resetInvoiceListCache(queryClient: QueryClient) {
  useInvoicesStore.setState({ hydrated: false });
  void queryClient.resetQueries({ queryKey: ["invoices"] });
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
