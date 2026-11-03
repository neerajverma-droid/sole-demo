"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PAYROLL_BILLING_HREF } from "@/components/payroll/payroll-banners";
import {
  useCompletePayrunsMutation,
  useDeletePayrunsMutation,
  useDuplicatePayrunMutation,
  useEmailPayslipsMutation,
  type PayrunBulkResult,
} from "@/hooks/use-payroll-payruns-query";
import { plural } from "@/lib/payroll";
import {
  employeePayslipFileName,
  exportPayrunCsv,
  fetchPayslipHtml,
  isPayrollBillingError,
  payrunCsvFileName,
  payrunErrorMessage,
  payslipsFileName,
  type PayrunRef,
} from "@/lib/payroll-payruns";
import { savePdfBlob } from "@/lib/invoices";
import { savePayslipPdfFromHtml } from "@/lib/payslip-pdf";

/**
 * Every pay run action the list, the drawer and the detail page share, with
 * the toasts they say. A 403 from the payroll guard (not enabled, or billing
 * paused) is a billing problem, so its toast carries the way there.
 */
export function usePayrunActions() {
  const router = useRouter();
  const completeMutation = useCompletePayrunsMutation();
  const emailMutation = useEmailPayslipsMutation();
  const deleteMutation = useDeletePayrunsMutation();
  const duplicateMutation = useDuplicatePayrunMutation();

  const showError = (error: unknown, fallback: string) => {
    toast.error(
      payrunErrorMessage(error, fallback),
      isPayrollBillingError(error)
        ? { action: { label: "Open billing", onClick: () => router.push(PAYROLL_BILLING_HREF) } }
        : undefined,
    );
  };

  /** One run says what happened to it; several say how many went through. */
  const report = (
    result: PayrunBulkResult,
    single: string,
    fallback: string,
  ): boolean => {
    if (result.failed === 0) {
      toast.success(
        result.succeeded === 1 ? single : `Successfully processed ${plural(result.succeeded, "pay run")}.`,
      );
      return true;
    }
    if (result.succeeded === 0) {
      showError(result.firstError, fallback);
      return false;
    }
    toast.warning(
      `Processed ${plural(result.succeeded, "pay run")}; ${result.failed} failed.`,
      { description: payrunErrorMessage(result.firstError, fallback) },
    );
    return true;
  };

  return {
    showError,

    downloadPayslips: (run: PayrunRef, employee?: { id: string | null; name: string }) =>
      toast.promise(
        fetchPayslipHtml(run, employee?.id).then((html) =>
          savePayslipPdfFromHtml(
            html,
            employee ? employeePayslipFileName(employee.name) : payslipsFileName(run),
          ),
        ),
        {
          loading: employee ? `Preparing ${employee.name}'s payslip…` : "Preparing payslips…",
          success: "Payslip PDF downloaded successfully.",
          error: (error) => payrunErrorMessage(error, "Unable to download payslips."),
        },
      ),

    exportCsv: (run: PayrunRef) =>
      toast.promise(
        exportPayrunCsv(run).then((blob) => savePdfBlob(blob, payrunCsvFileName(run))),
        {
          loading: "Exporting…",
          success: `${payrunCsvFileName(run)} downloaded`,
          error: (error) => payrunErrorMessage(error, "Unable to export the pay run."),
        },
      ),

    duplicate: async (run: PayrunRef) => {
      try {
        await duplicateMutation.mutateAsync(run);
        toast.success("Pay run duplicated as a draft.");
      } catch (error) {
        showError(error, "Unable to duplicate the pay run.");
      }
    },

    complete: async (runs: PayrunRef[]) =>
      report(
        await completeMutation.mutateAsync(runs),
        "Pay run marked as completed.",
        "Unable to complete the pay run.",
      ),

    email: async (runs: PayrunRef[]) =>
      report(
        await emailMutation.mutateAsync(runs),
        "Payslip emails processed.",
        "Unable to email payslips.",
      ),

    remove: async (runs: PayrunRef[]) =>
      report(
        await deleteMutation.mutateAsync(runs),
        "Pay run deleted.",
        "Unable to delete the pay run.",
      ),

    deleting: deleteMutation.isPending,
    busy: completeMutation.isPending || emailMutation.isPending,
  };
}
