"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  deleteProjectInvoiceApi,
  fetchProjectInvoiceSummary,
  fetchProjectInvoicesPage,
  projectInvoicePaidWithCashApi,
  sendProjectInvoicePaidReceiptApi,
  sendProjectInvoiceReminderApi,
} from "@/lib/project-invoices";

/** One page of the project's invoices; the previous page stays up while the next loads. */
export function useProjectInvoicesQuery(projectId: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ["project-invoices", projectId, "list", page, pageSize],
    queryFn: () => fetchProjectInvoicesPage(projectId, page, pageSize),
    placeholderData: keepPreviousData,
  });
}

/** The Invoiced / Paid / Outstanding cards — totals over every page, not the one on screen. */
export function useProjectInvoiceSummaryQuery(projectId: string) {
  return useQuery({
    queryKey: ["project-invoices", projectId, "summary"],
    queryFn: () => fetchProjectInvoiceSummary(projectId),
  });
}

/**
 * An invoice write moves this tab, the project's own figures (budget used,
 * the Overview's financial metrics) and the main Invoices screen, which
 * shares the same records.
 */
function useInvalidateProjectInvoices(projectId: string) {
  const queryClient = useQueryClient();
  return (invoiceId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-invoices", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["project"] }),
      queryClient.invalidateQueries({ queryKey: ["project-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["invoice-status-counts"] }),
      ...(invoiceId
        ? [queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] })]
        : []),
    ]);
}

export function useProjectInvoiceCashMutation(projectId: string) {
  const invalidate = useInvalidateProjectInvoices(projectId);
  return useMutation({
    mutationFn: (input: { invoiceId: string; undo: boolean; paymentDate?: string }) =>
      projectInvoicePaidWithCashApi(input.invoiceId, input),
    onSuccess: (_message, input) => invalidate(input.invoiceId),
  });
}

export function useDeleteProjectInvoiceMutation(projectId: string) {
  const invalidate = useInvalidateProjectInvoices(projectId);
  return useMutation({
    mutationFn: (invoiceId: string) => deleteProjectInvoiceApi(invoiceId),
    onSuccess: (_message, invoiceId) => invalidate(invoiceId),
  });
}

/** Emails only — nothing on the record changes, so nothing to refetch. */
export function useProjectInvoiceReminderMutation() {
  return useMutation({
    mutationFn: (invoiceId: string) => sendProjectInvoiceReminderApi(invoiceId),
  });
}

export function useProjectInvoicePaidReceiptMutation() {
  return useMutation({
    mutationFn: (invoiceId: string) => sendProjectInvoicePaidReceiptApi(invoiceId),
  });
}
