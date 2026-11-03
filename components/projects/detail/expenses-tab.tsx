"use client";

import * as React from "react";
import {
  CircleDollarSign,
  Eye,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { MenuAction } from "@/components/ui/menu-action";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { useProjectMoney } from "@/components/projects/project-shared";
import { AddProjectExpenseDialog } from "@/components/projects/detail/expenses/add-project-expense-dialog";
import { ProjectExpenseForm } from "@/components/projects/detail/expenses/project-expense-form";
import { ProjectExpenseInvoiceDialog } from "@/components/projects/detail/expenses/project-expense-invoice-dialog";
import { ProjectExpenseViewDialog } from "@/components/projects/detail/expenses/project-expense-view-dialog";
import {
  useProjectExpenseSummaryQuery,
  useProjectExpensesQuery,
} from "@/hooks/use-project-expenses-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatExpenseDate } from "@/lib/expenses";
import { pageInfo, type ProjectExpense } from "@/lib/project-expenses";
import type { Project } from "@/lib/projects";

const ALREADY_INVOICED = "Already on an invoice.";

/**
 * The project's Expenses tab — sole-webapp's `ExpensesTab.js`: the expenses
 * filed under this project, paged, with View, Edit and Convert to invoice on
 * each row, and "Add Expense" to assign existing expenses or create one.
 */
export function ProjectExpensesTab({ project }: { project: Project }) {
  const money = useProjectMoney();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [converting, setConverting] = React.useState<ProjectExpense | null>(null);
  const [viewId, setViewId] = React.useState<string | null>(null);

  const listQuery = useProjectExpensesQuery(project.id, page, pageSize);
  const summaryQuery = useProjectExpenseSummaryQuery(project.id);
  const expenses = listQuery.data?.expenses ?? [];
  const total = listQuery.data?.total ?? 0;


  const summary = summaryQuery.data;
  const stats: StatCard[] = [
    {
      key: "total",
      label: "Total expenses",
      value: money(summary?.total ?? 0),
      meta: `${summary?.count ?? 0} ${summary?.count === 1 ? "item" : "items"}`,
      icon: Wallet,
      tone: "danger",
    },
    {
      key: "invoiced",
      label: "Invoiced",
      value: money(summary?.invoiced ?? 0),
      meta: "On-charged to the client",
      icon: CircleDollarSign,
      tone: "success",
    },
    {
      key: "not-invoiced",
      label: "Not invoiced",
      value: money(summary?.notInvoiced ?? 0),
      meta: `${summary?.notInvoicedCount ?? 0} not yet billed`,
      icon: ReceiptText,
      tileTone: "bg-muted text-muted-foreground",
    },
  ];

  const dialogs = (
    <>
      <AddProjectExpenseDialog projectId={project.id} open={addOpen} onOpenChange={setAddOpen} />

      <Dialog open={editId !== null} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="max-h-[92svh] w-[96vw] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit expense</DialogTitle>
            <DialogDescription>Changes stay on this project.</DialogDescription>
          </DialogHeader>
          {editId && (
            <ProjectExpenseForm
              key={editId}
              projectId={project.id}
              expenseId={editId}
              onDone={() => setEditId(null)}
              onCancel={() => setEditId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ProjectExpenseInvoiceDialog
        project={project}
        expense={converting}
        onClose={() => setConverting(null)}
      />

      {/* The old project view's fields only — not the Expenses screen's fuller dialog. */}
      <ProjectExpenseViewDialog
        expenseId={viewId}
        onOpenChange={(open) => !open && setViewId(null)}
      />
    </>
  );

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
        <EmptyTitle>Couldn&apos;t load expenses</EmptyTitle>
        <EmptyDescription>
          {apiErrorMessage(listQuery.error, "Something went wrong loading this project's expenses.")}
        </EmptyDescription>
        <EmptyActions>
          <Button variant="outline" onClick={() => listQuery.refetch()}>
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
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No expenses yet</EmptyTitle>
          <EmptyDescription>Expenses related to this project will appear here.</EmptyDescription>
          <EmptyActions>
            <Button onClick={() => setAddOpen(true)}>
              <Plus />
              Add Expense
            </Button>
          </EmptyActions>
        </Empty>
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-[15px]">
      <StatCards stats={stats} loading={summaryQuery.isLoading} className="gap-[15px]" />

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 px-[15px] py-3">
          <h3 className="font-semibold">
            Expenses <span className="font-normal text-muted-foreground tabular">({total})</span>
          </h3>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus />
            Add Expense
          </Button>
        </div>

        <div className="border-t border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HUG_COLUMN}>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Job</TableHead>
                <TableHead className={HUG_COLUMN}>Invoice</TableHead>
                <TableHead className={`${HUG_COLUMN} text-right`}>Amount</TableHead>
                <TableHead className={HUG_COLUMN}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className={`${HUG_COLUMN} tabular`}>
                    {expense.date ? formatExpenseDate(expense.date) : "—"}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <p className="truncate font-medium">{expense.description || "—"}</p>
                    {expense.supplierName && (
                      <p className="truncate text-xs text-muted-foreground">{expense.supplierName}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{expense.category || "Other"}</TableCell>
                  <TableCell className="text-muted-foreground">{expense.jobLabel || "—"}</TableCell>
                  <TableCell className={HUG_COLUMN}>
                    {expense.invoiced ? (
                      <Badge variant="success">{expense.invoiceNo || "Invoiced"}</Badge>
                    ) : (
                      <Badge variant="secondary">Not invoiced</Badge>
                    )}
                  </TableCell>
                  <TableCell className={`${HUG_COLUMN} text-right font-medium tabular`}>
                    {money(expense.amount)}
                  </TableCell>
                  <TableCell className={HUG_COLUMN}>
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Actions for ${expense.description || "expense"}`}
                          >
                            <MoreHorizontal className="size-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <MenuAction icon={<Eye />} label="View" onSelect={() => setViewId(expense.id)} />
                          {/* sole-webapp locks an invoiced expense: no edit, no second invoice. */}
                          <MenuAction
                            icon={<Pencil />}
                            label="Edit expense"
                            onSelect={() => setEditId(expense.id)}
                            disabledReason={expense.invoiced ? ALREADY_INVOICED : undefined}
                          />
                          <MenuAction
                            icon={<Receipt />}
                            label="Convert to invoice"
                            onSelect={() => setConverting(expense)}
                            disabledReason={expense.invoiced ? ALREADY_INVOICED : undefined}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

      </section>

      {/* The main Expenses screen's pagination, under the card as there. */}
      <NumberedPagination
        page={pageInfo(page, pageSize, total)}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
        itemLabel="expense"
        navLabel="Project expenses pages"
        disabled={listQuery.isPlaceholderData}
      />

      {dialogs}
    </div>
  );
}
