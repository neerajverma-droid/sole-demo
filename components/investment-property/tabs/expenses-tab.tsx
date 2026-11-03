"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Clock, Receipt, Search, Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shimmer } from "@/components/ui/shimmer";
import {
  FormDialog,
  Loadable,
  ModuleCard,
  ModuleEmpty,
  usePropertyMoney,
} from "@/components/investment-property/module-shared";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useAssignExpensesMutation,
  useAssignableExpensesQuery,
  usePropertyExpensesQuery,
} from "@/hooks/use-property-modules-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  formatPropertyDate,
  pageInfoFor,
  type Property,
} from "@/lib/investment-property";
import { cn } from "@/lib/utils";

function AssignDialog({
  open,
  onOpenChange,
  propertyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
}) {
  const money = usePropertyMoney();
  const [search, setSearch] = React.useState("");
  const debounced = useDebouncedValue(search);
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const query = useAssignableExpensesQuery(page, 8, debounced, open);
  const assign = useAssignExpensesMutation(propertyId);

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageRowIds = rows.map((row) => row.id);
  const allOnPage = pageRowIds.length > 0 && pageRowIds.every((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of pageRowIds) {
        if (allOnPage) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const submit = () => {
    if (selected.size === 0) {
      toast.error("Select at least one expense to assign.");
      return;
    }
    assign.mutate([...selected], {
      onSuccess: (count) => {
        toast.success(`${count} ${count === 1 ? "expense" : "expenses"} assigned`);
        onOpenChange(false);
      },
      onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't assign the expenses.")),
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign expenses"
      description="Link existing expenses to this property. Only eligible expenses that aren't already assigned to a property are listed."
      submitLabel={selected.size > 0 ? `Assign ${selected.size}` : "Assign"}
      pending={assign.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search expenses by name"
          aria-label="Search assignable expenses"
          className="pl-9"
        />
      </div>

      {query.isLoading ? (
        <Shimmer className="h-48 w-full rounded-md" />
      ) : query.isError && rows.length === 0 ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {apiErrorMessage(query.error, "Couldn't load assignable expenses.")}
        </div>
      ) : rows.length === 0 ? (
        <ModuleEmpty
          icon={<Receipt aria-hidden />}
          title="No expenses to assign"
          description={
            debounced
              ? "No unassigned expenses match that search."
              : "Eligible expenses appear here until they're assigned to a property."
          }
        />
      ) : (
        <div className={cn("space-y-3", query.isPlaceholderData && "opacity-60")}>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={HUG_COLUMN}>
                    <Checkbox
                      checked={allOnPage}
                      onCheckedChange={togglePage}
                      aria-label="Select all expenses on this page"
                    />
                  </TableHead>
                  <TableHead className={HUG_COLUMN}>Date</TableHead>
                  <TableHead>Expense</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-right")}>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((expense) => (
                  <TableRow key={expense.id} data-state={selected.has(expense.id) ? "selected" : undefined}>
                    <TableCell className={HUG_COLUMN}>
                      <Checkbox
                        checked={selected.has(expense.id)}
                        onCheckedChange={() => toggle(expense.id)}
                        aria-label={`Select ${expense.name}`}
                      />
                    </TableCell>
                    <TableCell className={cn(HUG_COLUMN, "tabular text-muted-foreground")}>
                      {formatPropertyDate(expense.date)}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <span className="block truncate font-medium">{expense.name}</span>
                    </TableCell>
                    <TableCell className="max-w-[160px] text-muted-foreground">
                      <span className="block truncate">{expense.category || "—"}</span>
                    </TableCell>
                    <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
                      {money(expense.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <NumberedPagination
            page={pageInfoFor(page, 8, total)}
            pageSize={8}
            pageSizes={[8]}
            onPageChange={setPage}
            onPageSizeChange={() => undefined}
            itemLabel="expense"
            navLabel="Assignable expenses pages"
            disabled={query.isPlaceholderData}
          />
        </div>
      )}
    </FormDialog>
  );
}

export function ExpensesTab({ property }: { property: Property }) {
  const money = usePropertyMoney();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const query = usePropertyExpensesQuery(property.id, page, pageSize);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const readOnly = property.status === "disposed";

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  React.useEffect(() => {
    if (!query.isPlaceholderData && page > pageCount) setPage(pageCount);
  }, [query.isPlaceholderData, page, pageCount]);

  return (
    <ModuleCard
      title="Expenses"
      description="Expenses assigned to this property. Create new ones from Expenses, then assign them here."
      action={
        <Button size="sm" disabled={readOnly} onClick={() => setAssignOpen(true)}>
          <Plus />
          Assign expenses
        </Button>
      }
    >
      <Loadable query={query} skeletonClassName="h-56">
        {(data) =>
          data.total === 0 ? (
            <ModuleEmpty
              icon={<Receipt aria-hidden />}
              title="No expenses assigned"
              description="Assign rates, repairs, agent fees and other costs so they count towards this property's results."
              action={
                !readOnly && (
                  <Button size="sm" onClick={() => setAssignOpen(true)}>
                    <Plus />
                    Assign expenses
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Total: <b className="text-foreground tabular">{money(data.totalAmount)}</b>
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={HUG_COLUMN}>Date</TableHead>
                      <TableHead>Expense</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Amount</TableHead>
                      <TableHead className={HUG_COLUMN}>Receipt</TableHead>
                      <TableHead className={HUG_COLUMN}>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className={cn(HUG_COLUMN, "tabular text-muted-foreground")}>
                          {formatPropertyDate(expense.date)}
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <Link
                            href={`/expenses/${expense.id}`}
                            className="block truncate font-medium outline-none hover:text-primary hover:underline focus-visible:underline"
                          >
                            {expense.name}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[200px] text-muted-foreground">
                          <span className="block truncate">{expense.category || "—"}</span>
                        </TableCell>
                        <TableCell className={cn(HUG_COLUMN, "text-right font-medium tabular")}>
                          {money(expense.amount)}
                        </TableCell>
                        <TableCell className={HUG_COLUMN}>
                          {expense.hasReceipt ? (
                            <Paperclip className="size-4 text-muted-foreground" aria-label="Has receipt" />
                          ) : (
                            <span className="text-xs text-warning">Missing</span>
                          )}
                        </TableCell>
                        <TableCell className={HUG_COLUMN}>
                          {expense.matched ? (
                            <Badge variant="success">
                              <Check className="mr-1 size-3" aria-hidden />
                              Matched
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Clock className="mr-1 size-3" aria-hidden />
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <NumberedPagination
                page={pageInfoFor(page, pageSize, data.total)}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
                itemLabel="expense"
                navLabel="Property expenses pages"
                disabled={query.isPlaceholderData}
              />
            </div>
          )
        }
      </Loadable>

      {assignOpen && <AssignDialog open onOpenChange={setAssignOpen} propertyId={property.id} />}
    </ModuleCard>
  );
}
