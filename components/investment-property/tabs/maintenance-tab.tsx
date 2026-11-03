"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Link2, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { MenuAction } from "@/components/ui/menu-action";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import {
  ConfirmDeleteDialog,
  FormDialog,
  Loadable,
  ModuleCard,
  ModuleEmpty,
  RowMenu,
  invalidClass,
  useFieldErrors,
  PropertyMoneyInput,
  usePropertyMoney,
} from "@/components/investment-property/module-shared";
import {
  useDeleteMaintenanceMutation,
  useLinkMaintenanceExpenseMutation,
  useMaintenanceItemQuery,
  useMaintenanceQuery,
  useAllPropertyExpensesQuery,
  useSaveMaintenanceMutation,
} from "@/hooks/use-property-modules-query";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchBusinessContacts } from "@/lib/clients";
import {
  formatPropertyDate,
  pageInfoFor,
  type Property,
} from "@/lib/investment-property";
import {
  MAINTENANCE_STATUSES,
  draftFromMaintenance,
  emptyMaintenanceDraft,
  maintenanceIssues,
  maintenanceStatusLabel,
  maintenanceStatusTone,
  type MaintenanceDraft,
  type MaintenanceItem,
  type MaintenanceStatus,
  type MaintenanceStatusFilter,
} from "@/lib/investment-property-maintenance";
import { cn } from "@/lib/utils";

const FILTER_PILLS = ["All", ...MAINTENANCE_STATUSES.map((status) => status.label)] as const;

function filterFromPill(pill: string): MaintenanceStatusFilter {
  return MAINTENANCE_STATUSES.find((status) => status.label === pill)?.value ?? "all";
}

function pillFromFilter(filter: MaintenanceStatusFilter): string {
  return filter === "all" ? "All" : maintenanceStatusLabel(filter);
}

const NO_CONTRACTOR = "none";
const CONVERTED_REASON = "Linked to an expense — converted items are locked.";
const READ_ONLY_REASON = "Sold properties are read-only.";

function MaintenanceForm({
  initial,
  editingId,
  open,
  onOpenChange,
  propertyId,
}: {
  initial: MaintenanceDraft;
  editingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
}) {
  const save = useSaveMaintenanceMutation(propertyId);
  const suppliers = useQuery({
    queryKey: ["investment-property", "maintenance-suppliers"],
    queryFn: () => fetchBusinessContacts("Supplier"),
  });
  const [draft, setDraft] = React.useState<MaintenanceDraft>(initial);
  const issues = maintenanceIssues(draft);
  const { error, touch, attempt } = useFieldErrors(issues);

  const patch = (values: Partial<MaintenanceDraft>) => {
    touch(...(Object.keys(values) as (keyof MaintenanceDraft)[]));
    setDraft((current) => ({ ...current, ...values }));
  };

  const submit = () => {
    if (!attempt() || save.isPending) return;
    save.mutate(
      { id: editingId, draft },
      {
        onSuccess: () => {
          toast.success(editingId ? "Maintenance item updated" : "Maintenance item added");
          onOpenChange(false);
        },
        onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't save the maintenance item.")),
      },
    );
  };

  const contractors = suppliers.data ?? [];
  const knownContractor = contractors.some((contact) => contact.id === draft.clientId);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? "Edit maintenance item" : "Add maintenance item"}
      description="Log repairs and upkeep, track quotes and costs, then convert to an expense once paid."
      submitLabel={editingId ? "Save changes" : "Add item"}
      pending={save.isPending}
      onSubmit={submit}
    >
      <Field label="Title" htmlFor="maintenance-title" required error={error("title")}>
        <Input
          id="maintenance-title"
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder="e.g. Replace hot water system"
          aria-invalid={!!error("title")}
          className={invalidClass(error("title"))}
          maxLength={255}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Issue date" required error={error("issueDate")}>
          <DatePicker
            label="Issue date"
            value={draft.issueDate}
            onChange={(issueDate) => patch({ issueDate })}
          />
        </Field>
        <Field label="Status">
          <Select value={draft.status} onValueChange={(value) => patch({ status: value as MaintenanceStatus })}>
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Estimated cost" htmlFor="maintenance-estimate" error={error("estimatedCost")}>
          <PropertyMoneyInput
            id="maintenance-estimate"
            label="Estimated cost"
            value={draft.estimatedCost}
            onChange={(estimatedCost) => patch({ estimatedCost })}
            invalid={!!error("estimatedCost")}
            placeholder="0.00"
          />
        </Field>
        <Field label="Actual cost" htmlFor="maintenance-actual" error={error("actualCost")}>
          <PropertyMoneyInput
            id="maintenance-actual"
            label="Actual cost"
            value={draft.actualCost}
            onChange={(actualCost) => patch({ actualCost })}
            invalid={!!error("actualCost")}
            placeholder="0.00"
          />
        </Field>
      </div>
      <Field label="Contractor">
        <Select
          value={draft.clientId ?? NO_CONTRACTOR}
          onValueChange={(value) => {
            const contact = contractors.find((entry) => entry.id === value);
            patch({
              clientId: value === NO_CONTRACTOR ? null : value,
              clientName: contact?.name ?? "",
            });
          }}
        >
          <SelectTrigger aria-label="Contractor">
            <SelectValue placeholder={suppliers.isLoading ? "Loading suppliers…" : "No contractor"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CONTRACTOR}>No contractor</SelectItem>
            {draft.clientId && !knownContractor && (
              <SelectItem value={draft.clientId}>{draft.clientName || "Current contractor"}</SelectItem>
            )}
            {contractors.map((contact) => (
              <SelectItem key={contact.id} value={contact.id}>
                {contact.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Notes" htmlFor="maintenance-notes">
        <Textarea
          id="maintenance-notes"
          value={draft.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          rows={3}
          placeholder="Quote details, access instructions, tenant contact…"
        />
      </Field>
    </FormDialog>
  );
}

function EditLoader({
  propertyId,
  item,
  onClose,
}: {
  propertyId: string;
  item: MaintenanceItem;
  onClose: () => void;
}) {
  const query = useMaintenanceItemQuery(propertyId, item.id);
  const [seed, setSeed] = React.useState<MaintenanceDraft | null>(null);

  React.useEffect(() => {
    if (seed || !query.data || query.isFetching) return;
    setSeed(draftFromMaintenance(query.data));
  }, [seed, query.data, query.isFetching]);

  if (!seed) {
    if (query.isError) {
      return (
        <FormDialog
          open
          onOpenChange={(open) => !open && onClose()}
          title="Edit maintenance item"
          submitLabel="Save changes"
          pending={false}
          onSubmit={() => query.refetch()}
        >
          <p className="text-sm text-destructive">
            {apiErrorMessage(query.error, "Couldn't load this maintenance item.")}
          </p>
        </FormDialog>
      );
    }
    return null;
  }

  return (
    <MaintenanceForm
      initial={seed}
      editingId={item.id}
      open
      onOpenChange={(open) => !open && onClose()}
      propertyId={propertyId}
    />
  );
}

function LinkExpenseDialog({
  item,
  propertyId,
  onClose,
}: {
  item: MaintenanceItem;
  propertyId: string;
  onClose: () => void;
}) {
  const money = usePropertyMoney();
  const expenses = useAllPropertyExpensesQuery(propertyId);
  const link = useLinkMaintenanceExpenseMutation(propertyId);
  const [expenseId, setExpenseId] = React.useState("");
  const [attempted, setAttempted] = React.useState(false);

  const submit = () => {
    setAttempted(true);
    if (!expenseId || link.isPending) return;
    link.mutate(
      { id: item.id, expenseId },
      {
        onSuccess: () => {
          toast.success("Expense linked");
          onClose();
        },
        onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't link the expense.")),
      },
    );
  };

  const rows = expenses.data ?? [];

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Link an expense"
      description={`Link “${item.title}” to the expense that paid for it. Linked items are locked from further edits.`}
      submitLabel="Link expense"
      pending={link.isPending}
      onSubmit={submit}
      size="sm"
    >
      {expenses.isLoading ? (
        <Shimmer className="h-9 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This property has no expenses yet. Assign an expense from the Expenses tab first.
        </p>
      ) : (
        <Field
          label="Expense"
          required
          error={attempted && !expenseId ? "Choose the expense to link." : undefined}
        >
          <Select value={expenseId} onValueChange={setExpenseId}>
            <SelectTrigger aria-label="Expense">
              <SelectValue placeholder="Select an expense" />
            </SelectTrigger>
            <SelectContent>
              {rows.map((expense) => (
                <SelectItem key={expense.id} value={expense.id}>
                  {expense.name} · {money(expense.amount)} · {formatPropertyDate(expense.date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </FormDialog>
  );
}

export function MaintenanceTab({ property }: { property: Property }) {
  const money = usePropertyMoney();
  const [status, setStatus] = React.useState<MaintenanceStatusFilter>("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const query = useMaintenanceQuery(property.id, { page, limit: pageSize, status });
  const remove = useDeleteMaintenanceMutation(property.id);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<MaintenanceItem | null>(null);
  const [linking, setLinking] = React.useState<MaintenanceItem | null>(null);
  const [deleting, setDeleting] = React.useState<MaintenanceItem | null>(null);
  const readOnly = property.status === "disposed";

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  React.useEffect(() => {
    if (!query.isPlaceholderData && page > pageCount) setPage(pageCount);
  }, [query.isPlaceholderData, page, pageCount]);

  const filtered = status !== "all";

  return (
    <ModuleCard
      title="Maintenance"
      description="Repairs and upkeep for this property, from first report through to payment."
      action={
        <Button size="sm" disabled={readOnly} onClick={() => setCreating(true)}>
          <Plus />
          Add item
        </Button>
      }
    >
      <FilterPills
        label="Maintenance status"
        options={FILTER_PILLS}
        value={pillFromFilter(status)}
        onChange={(next) => {
          setStatus(filterFromPill(next));
          setPage(1);
        }}
      />

      <Loadable query={query} skeletonClassName="h-56">
        {(data) =>
          data.total === 0 ? (
            <ModuleEmpty
              icon={<Wrench aria-hidden />}
              title={filtered ? "No items with this status" : "No maintenance logged"}
              description={
                filtered
                  ? "Try a different status."
                  : "Log a repair to track quotes, costs and who's doing the work."
              }
              action={
                !filtered && !readOnly ? (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    <Plus />
                    Add item
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground tabular">
                This page — estimated{" "}
                <b className="text-foreground">{money(data.totalEstimated)}</b> · actual{" "}
                <b className="text-foreground">{money(data.totalActual)}</b>
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={HUG_COLUMN}>Issue date</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Contractor</TableHead>
                      <TableHead className={HUG_COLUMN}>Status</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Estimated</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Actual</TableHead>
                      <TableHead className={HUG_COLUMN}>Expense</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((item) => {
                      const locked = item.linkedExpenseId !== null;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className={cn(HUG_COLUMN, "tabular text-muted-foreground")}>
                            {formatPropertyDate(item.issueDate)}
                          </TableCell>
                          <TableCell className="max-w-[240px]">
                            <span className="block truncate font-medium">{item.title}</span>
                          </TableCell>
                          <TableCell className="max-w-[180px] text-muted-foreground">
                            <span className="block truncate">{item.clientName || "—"}</span>
                          </TableCell>
                          <TableCell className={HUG_COLUMN}>
                            <Badge variant={maintenanceStatusTone(item.status)}>
                              {maintenanceStatusLabel(item.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
                            {item.estimatedCost === null ? "—" : money(item.estimatedCost)}
                          </TableCell>
                          <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
                            {item.actualCost === null ? "—" : money(item.actualCost)}
                          </TableCell>
                          <TableCell className={HUG_COLUMN}>
                            {item.linkedExpenseId ? (
                              <Link
                                href={`/expenses/${item.linkedExpenseId}`}
                                className="text-sm text-primary hover:underline"
                              >
                                View expense
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className={HUG_COLUMN}>
                            <div className="flex justify-end">
                              <RowMenu label={`Actions for ${item.title}`}>
                                <MenuAction
                                  icon={<Pencil />}
                                  label="Edit"
                                  onSelect={() => setEditing(item)}
                                  disabledReason={readOnly ? READ_ONLY_REASON : locked ? CONVERTED_REASON : undefined}
                                />
                                <MenuAction
                                  icon={<Link2 />}
                                  label="Link expense"
                                  onSelect={() => setLinking(item)}
                                  disabledReason={
                                    readOnly ? READ_ONLY_REASON : locked ? "Already linked to an expense." : undefined
                                  }
                                />
                                <MenuAction
                                  icon={<Trash2 />}
                                  label="Delete"
                                  destructive
                                  onSelect={() => setDeleting(item)}
                                  disabledReason={readOnly ? READ_ONLY_REASON : locked ? CONVERTED_REASON : undefined}
                                />
                              </RowMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
                itemLabel="item"
                navLabel="Maintenance pages"
                disabled={query.isPlaceholderData}
              />
            </div>
          )
        }
      </Loadable>

      {creating && (
        <MaintenanceForm
          initial={emptyMaintenanceDraft()}
          editingId={null}
          open
          onOpenChange={(open) => !open && setCreating(false)}
          propertyId={property.id}
        />
      )}
      {editing && (
        <EditLoader propertyId={property.id} item={editing} onClose={() => setEditing(null)} />
      )}
      {linking && (
        <LinkExpenseDialog item={linking} propertyId={property.id} onClose={() => setLinking(null)} />
      )}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete maintenance item?"
        description={deleting ? `This removes “${deleting.title}”. This action can't be undone.` : ""}
        confirmLabel="Delete item"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Maintenance item deleted");
              setDeleting(null);
            },
            onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't delete the item.")),
          });
        }}
      />
    </ModuleCard>
  );
}
