"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  toUploadRows,
  uploadBulkTransactions,
  validateBulkTransactions,
  type BulkTransactionRow,
  type BulkUploadResult,
  type ValidatedTransactionRow,
} from "@/lib/bulk-transactions";

/**
 * Step one of the import: hand the parsed rows over and get back what the
 * user's matching rules made of them.
 *
 * Split from the upload because the wizard's Sole Fields step sits between
 * the two — the whole point of validating first is that someone sees the
 * rules' work and can complete or clear it before anything is written.
 */
export function useValidateBulkTransactions() {
  return useMutation<ValidatedTransactionRow[], Error, BulkTransactionRow[]>({
    mutationFn: (rows) => validateBulkTransactions(rows),
  });
}

/** Step two: write the rows the Sole Fields step signed off on. */
export function useUploadBulkTransactions() {
  const queryClient = useQueryClient();

  return useMutation<BulkUploadResult, Error, ValidatedTransactionRow[]>({
    mutationFn: (rows) => uploadBulkTransactions(toUploadRows(rows)),
    onSuccess: () => {
      // The Transaction Listing report counts imported transactions, and a
      // rule-matched import changes what the sync stats have left to do.
      queryClient.invalidateQueries({ queryKey: ["transaction-listing-report"] });
      queryClient.invalidateQueries({ queryKey: ["rule-sync-stats"] });
    },
  });
}
