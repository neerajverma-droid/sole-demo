"use client";

import {
  Check,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Receipt,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuAction } from "@/components/ui/menu-action";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectMoney } from "@/components/projects/project-shared";
import type { ProjectInvoice, ProjectInvoiceStatus } from "@/lib/project-invoices";
import { formatInvoiceDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

const STATUS: Record<
  ProjectInvoiceStatus,
  { label: string; variant: "success" | "warning" | "danger" | "secondary" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  sent: { label: "Sent", variant: "warning" },
  overdue: { label: "Overdue", variant: "danger" },
  partially_paid: { label: "Partially paid", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
};

export type ProjectInvoiceActions = {
  onView: (invoice: ProjectInvoice) => void;
  onDownload: (invoice: ProjectInvoice) => void;
  onMarkPaid: (invoice: ProjectInvoice) => void;
  onUndoPaid: (invoice: ProjectInvoice) => void;
  onRemind: (invoice: ProjectInvoice) => void;
  onSendReceipt: (invoice: ProjectInvoice) => void;
  onDelete: (invoice: ProjectInvoice) => void;
};

export function ProjectInvoicesTable({
  rows,
  settling,
  actions,
}: {
  rows: ProjectInvoice[];
  /** A page change is in flight — the old rows stay up, dimmed. */
  settling?: boolean;
  actions: ProjectInvoiceActions;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {/* The Expenses tab's column order: date first, then what it is. */}
          <TableHead className={HUG_COLUMN}>Date</TableHead>
          <TableHead>Invoice</TableHead>
          <TableHead className={HUG_COLUMN}>Due</TableHead>
          <TableHead className={HUG_COLUMN}>Status</TableHead>
          <TableHead className={cn(HUG_COLUMN, "text-right")}>Amount</TableHead>
          <TableHead className={HUG_COLUMN}>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className={cn(settling && "opacity-60 transition-opacity")}>
        {rows.map((invoice) => (
          <ProjectInvoiceRow key={invoice.id} invoice={invoice} actions={actions} />
        ))}
      </TableBody>
    </Table>
  );
}

function ProjectInvoiceRow({
  invoice,
  actions,
}: {
  invoice: ProjectInvoice;
  actions: ProjectInvoiceActions;
}) {
  const money = useProjectMoney();
  const status = STATUS[invoice.status];
  const paid = invoice.status === "paid";
  const draft = invoice.status === "draft";
  // The old tab's Client and Job/Task columns, folded under the number: on a
  // project's own tab the client is nearly always the project's, so neither
  // earns a full column.
  const subtitle = [invoice.clientName, invoice.description].filter(Boolean).join(" · ");

  /*
   * Each action is offered on exactly the rows the old tab offered it on. The
   * platform rule (see MenuAction) is to grey an entry out with the reason
   * rather than hide it, so a row the old tab hid an action on gets it
   * disabled instead. An imported (bulk upload) invoice only ever had View and
   * Delete.
   */
  const imported = invoice.bulkUpload ? "Imported by bulk upload" : undefined;
  const editReason = imported ?? (paid ? "Paid invoices can't be edited" : undefined);
  const markPaidReason =
    imported ??
    (draft
      ? "Send the invoice before marking it paid"
      : paid
        ? "Already paid"
        : undefined);
  const remindReason =
    imported ??
    (paid
      ? "This invoice is paid"
      : draft
        ? "Send the invoice before reminding the client"
        : undefined);
  const receiptReason = imported ?? (paid ? undefined : "Only a paid invoice has a receipt");
  const deleteReason = invoice.bulkUploadMatched
    ? "Matched imported invoices can't be deleted"
    : !invoice.bulkUpload && paid
      ? "Paid invoices can't be deleted"
      : undefined;
  // The old tab swapped "Mark as paid with cash" for its undo once a cash
  // payment was recorded, whether or not the invoice then read as paid.
  const showUndo = invoice.paidWithCash && !invoice.bulkUpload && !draft;

  return (
    <TableRow className="cursor-pointer" onClick={() => actions.onView(invoice)}>
      <TableCell className={cn(HUG_COLUMN, "tabular")}>
        {invoice.issued ? formatInvoiceDate(invoice.issued) : "—"}
      </TableCell>
      <TableCell className="max-w-72">
        <p className="truncate font-medium tabular">{invoice.number || "—"}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </TableCell>
      <TableCell
        className={cn(
          HUG_COLUMN,
          "tabular",
          invoice.status === "overdue" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {invoice.due ? formatInvoiceDate(invoice.due) : "—"}
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-right font-medium tabular")}>
        {money(invoice.total)}
      </TableCell>
      {/* The row opens the preview; the menu mustn't do that as well. */}
      <TableCell className={HUG_COLUMN} onClick={(event) => event.stopPropagation()}>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${invoice.number || "invoice"}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <MenuAction icon={<Eye />} label="View" onSelect={() => actions.onView(invoice)} />
              <MenuAction
                icon={<Download />}
                label="Download PDF"
                onSelect={() => actions.onDownload(invoice)}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Pencil />}
                label="Edit"
                href={`/invoices/${invoice.id}`}
                disabledReason={editReason}
              />
              {showUndo ? (
                <MenuAction
                  icon={<Undo2 />}
                  label="Undo paid with cash"
                  onSelect={() => actions.onUndoPaid(invoice)}
                />
              ) : (
                <MenuAction
                  icon={<Check />}
                  label="Mark as paid with cash"
                  onSelect={() => actions.onMarkPaid(invoice)}
                  disabledReason={markPaidReason}
                />
              )}
              <MenuAction
                icon={<Send />}
                label="Send reminder"
                onSelect={() => actions.onRemind(invoice)}
                disabledReason={remindReason}
              />
              <MenuAction
                icon={<Receipt />}
                label="Send paid receipt"
                onSelect={() => actions.onSendReceipt(invoice)}
                disabledReason={receiptReason}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Trash2 />}
                label="Delete"
                destructive
                onSelect={() => actions.onDelete(invoice)}
                disabledReason={deleteReason}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
