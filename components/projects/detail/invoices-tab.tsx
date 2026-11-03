"use client";

import * as React from "react";
import { CircleCheck, Clock, FileText, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import { InvoicePdfDialog } from "@/components/shared/invoice-pdf-dialog";
import { ProjectInvoiceCashDialog } from "@/components/projects/detail/invoices/project-invoice-cash-dialog";
import { ProjectInvoiceDeleteDialog } from "@/components/projects/detail/invoices/project-invoice-delete-dialog";
import {
  ProjectInvoicesTable,
  type ProjectInvoiceActions,
} from "@/components/projects/detail/invoices/project-invoices-table";
import { useProjectMoney } from "@/components/projects/project-shared";
import {
  useProjectInvoiceCashMutation,
  useProjectInvoicePaidReceiptMutation,
  useProjectInvoiceReminderMutation,
  useProjectInvoiceSummaryQuery,
  useProjectInvoicesQuery,
} from "@/hooks/use-project-invoices-query";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchInvoicePdfBlob, savePdfBlob } from "@/lib/invoices";
import {
  PROJECT_INVOICE_PAGE_SIZE,
  projectInvoicePageInfo,
  type ProjectInvoice,
} from "@/lib/project-invoices";
import type { Project } from "@/lib/projects";

/**
 * The project's invoices — sole-webapp's InvoicesTab.js in the design's
 * layout: Invoiced / Paid / Outstanding over a paginated table, each row
 * opening the invoice's real PDF, with the old tab's row actions (edit, cash
 * payment and its undo, reminder, paid receipt, delete) in its menu.
 *
 * Like the old tab it lists and acts on invoices but doesn't raise them —
 * an invoice joins a project from the invoice side.
 */
export function ProjectInvoicesTab({ project }: { project: Project }) {
  const money = useProjectMoney();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(PROJECT_INVOICE_PAGE_SIZE);

  const listQuery = useProjectInvoicesQuery(project.id, page, pageSize);
  const summaryQuery = useProjectInvoiceSummaryQuery(project.id);

  const [viewing, setViewing] = React.useState<ProjectInvoice | null>(null);
  const [payingCash, setPayingCash] = React.useState<ProjectInvoice | null>(null);
  const [deleting, setDeleting] = React.useState<ProjectInvoice | null>(null);

  const cash = useProjectInvoiceCashMutation(project.id);
  const reminder = useProjectInvoiceReminderMutation();
  const receipt = useProjectInvoicePaidReceiptMutation();

  const total = listQuery.data?.total ?? 0;
  const pageInfo = projectInvoicePageInfo(page, pageSize, total);

  // A delete that empties the last page would otherwise strand the table on a
  // page past the end.
  React.useEffect(() => {
    if (listQuery.data && page > pageInfo.pageCount) setPage(pageInfo.pageCount);
  }, [listQuery.data, page, pageInfo.pageCount]);

  const actions: ProjectInvoiceActions = {
    onView: setViewing,
    onDownload: (invoice) => {
      const label = invoice.number || "invoice";
      toast.promise(
        fetchInvoicePdfBlob(invoice, invoice.status === "paid").then((blob) =>
          savePdfBlob(blob, `${label}.pdf`),
        ),
        {
          loading: `Preparing ${label}…`,
          success: `${label} downloaded`,
          error: (error) => apiErrorMessage(error, "Couldn't download that PDF."),
        },
      );
    },
    onMarkPaid: setPayingCash,
    // Straight through, no confirmation — as the old tab did it.
    onUndoPaid: (invoice) =>
      cash.mutate(
        { invoiceId: invoice.id, undo: true },
        {
          onSuccess: () => toast.success("Invoice cash payment undone successfully!"),
          onError: (error) =>
            toast.error(
              apiErrorMessage(error, "Failed to update cash payment status. Please try again."),
            ),
        },
      ),
    onRemind: (invoice) =>
      reminder.mutate(invoice.id, {
        onSuccess: (message) =>
          toast.success(message || `Reminder sent for ${invoice.number || "the invoice"}`),
        onError: (error) => toast.error(apiErrorMessage(error, "Couldn't send the reminder.")),
      }),
    onSendReceipt: (invoice) =>
      receipt.mutate(invoice.id, {
        onSuccess: (message) => toast.success(message || "Invoice paid receipt sent successfully."),
        onError: (error) => toast.error(apiErrorMessage(error, "Couldn't send the paid receipt.")),
      }),
    onDelete: setDeleting,
  };

  const dialogs = (
    <>
      <InvoicePdfDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        // Only what the renderer reads — this row's status vocabulary isn't the
        // main list's, so the receipt switch is passed explicitly below.
        invoice={
          viewing
            ? { id: viewing.id, templateId: viewing.templateId, number: viewing.number }
            : undefined
        }
        // A settled invoice previews as its receipt, as the old InvoiceInfo did.
        receipt={viewing?.status === "paid"}
      />
      <ProjectInvoiceCashDialog
        projectId={project.id}
        invoice={payingCash}
        onOpenChange={(open) => !open && setPayingCash(null)}
      />
      <ProjectInvoiceDeleteDialog
        projectId={project.id}
        invoice={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </>
  );

  const summary = summaryQuery.data;
  const stats: StatCard[] = [
    {
      key: "invoiced",
      label: "Invoiced",
      tip: "Every invoice on this project except drafts.",
      value: money(summary?.invoiced ?? 0),
      meta: summary ? `${summary.count} invoice${summary.count === 1 ? "" : "s"}` : undefined,
      icon: FileText,
      tone: "primary",
    },
    {
      key: "paid",
      label: "Paid",
      value: money(summary?.paid ?? 0),
      meta: "Paid in full",
      icon: CircleCheck,
      tone: "success",
    },
    {
      key: "outstanding",
      label: "Outstanding",
      tip: "Invoiced but not yet paid in full. A partially paid invoice counts in full.",
      value: money(summary?.outstanding ?? 0),
      meta: "Awaiting payment",
      icon: Clock,
      tone: "warning",
    },
  ];

  if (listQuery.isLoading) {
    return (
      <div className="space-y-[15px]" aria-hidden>
        <StatCards stats={stats} loading className="gap-[15px]" />
        <Shimmer className="h-80 w-full rounded-lg border border-border" />
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <Empty>
        <EmptyMedia>
          <TriangleAlert aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>Couldn&apos;t load this project&apos;s invoices</EmptyTitle>
          <EmptyDescription>{apiErrorMessage(listQuery.error, "The server couldn't be reached.")}</EmptyDescription>
        </div>
        <EmptyActions>
          <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
            Try again
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  if (total === 0) {
    return (
      <>
        <Empty>
          <EmptyMedia>
            <FileText aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No invoices yet</EmptyTitle>
            <EmptyDescription>Invoices created for this project will appear here.</EmptyDescription>
          </div>
        </Empty>
        {dialogs}
      </>
    );
  }


  return (
    <div className="space-y-[15px]">
      <StatCards stats={stats} loading={summaryQuery.isLoading} className="gap-[15px]" />

      {/* The Expenses tab's frame: a title bar, the table edge to edge, and
          the rows-per-page bar at the foot — so the two tabs read as one set. */}
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 px-[15px] py-3">
          <h3 className="font-semibold">
            Invoices <span className="font-normal text-muted-foreground tabular">({total})</span>
          </h3>
        </div>

        <div className="border-t border-border">
          <ProjectInvoicesTable
            rows={listQuery.data?.rows ?? []}
            settling={listQuery.isPlaceholderData}
            actions={actions}
          />
        </div>

      </section>

      {/* The main Invoices screen's pagination, under the card as there. */}
      <NumberedPagination
        page={pageInfo}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
        itemLabel="invoice"
        navLabel="Project invoices pages"
        disabled={listQuery.isPlaceholderData}
      />

      {dialogs}
    </div>
  );
}
