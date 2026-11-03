"use client";

import * as React from "react";
import { Check, CircleDollarSign, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { MenuAction } from "@/components/ui/menu-action";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  useFieldErrors,
  PropertyMoneyInput,
  usePropertyMoney,
} from "@/components/investment-property/module-shared";
import {
  useDeleteIncomeMutation,
  useIncomeQuery,
  useRentalSchedulesQuery,
  useSaveIncomeMutation,
} from "@/hooks/use-property-modules-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  formatPropertyDate,
  pageInfoFor,
  type Property,
} from "@/lib/investment-property";
import {
  INCOME_SOURCES,
  draftFromIncome,
  emptyIncomeDraft,
  incomeIssues,
  type IncomeDraft,
  type IncomeMatchFilter,
  type IncomeSource,
  type IncomeSourceFilter,
  type PropertyIncome,
} from "@/lib/investment-property-income";
import { frequencyShort } from "@/lib/investment-property-rental";
import { cn } from "@/lib/utils";

const SOURCE_PILLS = ["All sources", "Manual", "Rental schedule"] as const;
const SOURCE_FROM_PILL: Record<(typeof SOURCE_PILLS)[number], IncomeSourceFilter> = {
  "All sources": "all",
  Manual: "manual",
  "Rental schedule": "rental_schedule",
};
const PILL_FROM_SOURCE: Record<IncomeSourceFilter, (typeof SOURCE_PILLS)[number]> = {
  all: "All sources",
  manual: "Manual",
  rental_schedule: "Rental schedule",
};

const MATCH_PILLS = ["Any status", "Matched", "Pending"] as const;
const MATCH_FROM_PILL: Record<(typeof MATCH_PILLS)[number], IncomeMatchFilter> = {
  "Any status": "all",
  Matched: "matched",
  Pending: "unmatched",
};
const PILL_FROM_MATCH: Record<IncomeMatchFilter, (typeof MATCH_PILLS)[number]> = {
  all: "Any status",
  matched: "Matched",
  unmatched: "Pending",
};

const LOCKED_REASON = "Matched to a bank transaction — unmatch it first.";

function IncomeForm({
  initial,
  editingId,
  open,
  onOpenChange,
  propertyId,
}: {
  initial: IncomeDraft;
  editingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
}) {
  const money = usePropertyMoney();
  const save = useSaveIncomeMutation(propertyId);
  const schedules = useRentalSchedulesQuery(propertyId);
  const [draft, setDraft] = React.useState<IncomeDraft>(initial);
  const issues = incomeIssues(draft);
  const { error, touch, attempt } = useFieldErrors(issues);

  const patch = (values: Partial<IncomeDraft>) => {
    touch(...(Object.keys(values) as (keyof IncomeDraft)[]));
    setDraft((current) => ({ ...current, ...values }));
  };

  const submit = () => {
    if (!attempt() || save.isPending) return;
    save.mutate(
      { id: editingId, draft },
      {
        onSuccess: () => {
          toast.success(editingId ? "Income updated" : "Income added");
          onOpenChange(false);
        },
        onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't save the income.")),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? "Edit income" : "Add income"}
      description="Record rent or other income received for this property."
      submitLabel={editingId ? "Save changes" : "Add income"}
      pending={save.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" required error={error("date")}>
          <DatePicker label="Income date" value={draft.date} onChange={(date) => patch({ date })} />
        </Field>
        <Field label="Amount" htmlFor="income-amount" required error={error("amount")}>
          <PropertyMoneyInput
            id="income-amount"
            label="Amount"
            value={draft.amount}
            onChange={(amount) => patch({ amount })}
            invalid={!!error("amount")}
            placeholder="0.00"
          />
        </Field>
      </div>
      <Field label="Source">
        <Select
          value={draft.source}
          onValueChange={(value) =>
            patch({ source: value as IncomeSource, scheduleId: value === "manual" ? "" : draft.scheduleId })
          }
        >
          <SelectTrigger aria-label="Income source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INCOME_SOURCES.map((source) => (
              <SelectItem key={source.value} value={source.value}>
                {source.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {draft.source === "rental_schedule" && (
        <Field label="Rental schedule" required error={error("scheduleId")}>
          <Select value={draft.scheduleId} onValueChange={(scheduleId) => patch({ scheduleId })}>
            <SelectTrigger aria-label="Rental schedule" aria-invalid={!!error("scheduleId")}>
              <SelectValue
                placeholder={schedules.isLoading ? "Loading schedules…" : "Select a rental schedule"}
              />
            </SelectTrigger>
            <SelectContent>
              {(schedules.data ?? []).map((schedule) => (
                <SelectItem key={schedule.id} value={schedule.id}>
                  {money(schedule.rentAmount)} {frequencyShort(schedule.frequency)} from{" "}
                  {formatPropertyDate(schedule.startDate)}
                  {schedule.active ? " (active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field label="Notes" htmlFor="income-notes">
        <Textarea
          id="income-notes"
          value={draft.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          rows={3}
          placeholder="Optional"
        />
      </Field>
    </FormDialog>
  );
}

export function IncomeTab({ property }: { property: Property }) {
  const money = usePropertyMoney();
  const [source, setSource] = React.useState<IncomeSourceFilter>("all");
  const [match, setMatch] = React.useState<IncomeMatchFilter>("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const query = useIncomeQuery(property.id, { page, limit: pageSize, source, match });
  const remove = useDeleteIncomeMutation(property.id);
  const [form, setForm] = React.useState<{ income: PropertyIncome | null } | null>(null);
  const [deleting, setDeleting] = React.useState<PropertyIncome | null>(null);
  const readOnly = property.status === "disposed";

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  React.useEffect(() => {
    if (!query.isPlaceholderData && page > pageCount) setPage(pageCount);
  }, [query.isPlaceholderData, page, pageCount]);

  const filtered = source !== "all" || match !== "all";

  return (
    <ModuleCard
      title="Income"
      description="Rent and other income received for this property."
      action={
        <Button size="sm" disabled={readOnly} onClick={() => setForm({ income: null })}>
          <Plus />
          Add income
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <FilterPills
          label="Income source"
          options={SOURCE_PILLS}
          value={PILL_FROM_SOURCE[source]}
          onChange={(next) => {
            setSource(SOURCE_FROM_PILL[next]);
            setPage(1);
          }}
        />
        <FilterPills
          label="Reconciliation status"
          options={MATCH_PILLS}
          value={PILL_FROM_MATCH[match]}
          onChange={(next) => {
            setMatch(MATCH_FROM_PILL[next]);
            setPage(1);
          }}
        />
      </div>

      <Loadable query={query} skeletonClassName="h-56">
        {(data) =>
          data.total === 0 ? (
            <ModuleEmpty
              icon={<CircleDollarSign aria-hidden />}
              title={filtered ? "No income matches these filters" : "No income recorded"}
              description={
                filtered
                  ? "Try a different source or status."
                  : "Add rent as it arrives, or set up a rental schedule to have it created for you."
              }
              action={
                !filtered && !readOnly ? (
                  <Button size="sm" onClick={() => setForm({ income: null })}>
                    <Plus />
                    Add income
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Total{filtered ? " (filtered)" : ""}:{" "}
                <b className="text-foreground tabular">{money(data.totalAmount)}</b>
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={HUG_COLUMN}>Date</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Amount</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className={HUG_COLUMN}>Status</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((income) => (
                      <TableRow key={income.id}>
                        <TableCell className={cn(HUG_COLUMN, "tabular text-muted-foreground")}>
                          {formatPropertyDate(income.date)}
                        </TableCell>
                        <TableCell className={cn(HUG_COLUMN, "text-right font-medium tabular")}>
                          {money(income.amount)}
                        </TableCell>
                        <TableCell>
                          {income.source === "rental_schedule" ? (
                            <span>
                              Rental schedule
                              {income.scheduleRent !== null && (
                                <span className="block text-xs text-muted-foreground">
                                  {money(income.scheduleRent)} {frequencyShort(income.scheduleFrequency)}
                                </span>
                              )}
                            </span>
                          ) : (
                            "Manual entry"
                          )}
                        </TableCell>
                        <TableCell className="max-w-[240px] text-muted-foreground">
                          <span className="block truncate">{income.notes || "—"}</span>
                        </TableCell>
                        <TableCell className={HUG_COLUMN}>
                          {income.reconciled ? (
                            <Badge variant="success">
                              <Check className="mr-1 size-3" aria-hidden />
                              Matched
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Clock className="mr-1 size-3" aria-hidden />
                              Pending
                              {income.possibleMatches > 0 ? ` · ${income.possibleMatches} possible` : ""}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={HUG_COLUMN}>
                          <div className="flex justify-end">
                            <RowMenu label={`Actions for income on ${formatPropertyDate(income.date)}`}>
                              <MenuAction
                                icon={<Pencil />}
                                label="Edit"
                                onSelect={() => setForm({ income })}
                                disabledReason={
                                  readOnly ? "Sold properties are read-only." : income.reconciled ? LOCKED_REASON : undefined
                                }
                              />
                              <MenuAction
                                icon={<Trash2 />}
                                label="Delete"
                                destructive
                                onSelect={() => setDeleting(income)}
                                disabledReason={
                                  readOnly ? "Sold properties are read-only." : income.reconciled ? LOCKED_REASON : undefined
                                }
                              />
                            </RowMenu>
                          </div>
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
                itemLabel="entry"
                itemLabelPlural="entries"
                navLabel="Income pages"
                disabled={query.isPlaceholderData}
              />
            </div>
          )
        }
      </Loadable>

      {form && (
        <IncomeForm
          initial={form.income ? draftFromIncome(form.income) : emptyIncomeDraft()}
          editingId={form.income?.id ?? null}
          open
          onOpenChange={(open) => !open && setForm(null)}
          propertyId={property.id}
        />
      )}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete income?"
        description={
          deleting
            ? `This removes the ${money(deleting.amount)} entry dated ${formatPropertyDate(deleting.date)}. This action can't be undone.`
            : ""
        }
        confirmLabel="Delete income"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Income deleted");
              setDeleting(null);
            },
            onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't delete the income.")),
          });
        }}
      />
    </ModuleCard>
  );
}
