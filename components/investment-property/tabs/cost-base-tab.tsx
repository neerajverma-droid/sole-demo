"use client";

import * as React from "react";
import { Hammer, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MenuAction } from "@/components/ui/menu-action";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
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
  useCostBaseAdjustmentsQuery,
  useCostBaseStatsQuery,
  useDeleteAdjustmentMutation,
  useSaveAdjustmentMutation,
} from "@/hooks/use-property-modules-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  formatPropertyDate,
  pageInfoFor,
  type Property,
} from "@/lib/investment-property";
import {
  adjustmentIssues,
  draftFromAdjustment,
  emptyAdjustmentDraft,
  type AdjustmentDraft,
  type CostBaseAdjustment,
} from "@/lib/investment-property-cost-base";
import { parseIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

const READ_ONLY_REASON = "Sold properties are read-only.";

function AdjustmentForm({
  initial,
  editingId,
  property,
  open,
  onOpenChange,
}: {
  initial: AdjustmentDraft;
  editingId: string | null;
  property: Property;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveAdjustmentMutation(property.id);
  const [draft, setDraft] = React.useState<AdjustmentDraft>(initial);
  const issues = adjustmentIssues(draft, property.purchaseDate);
  const { error, touch, attempt } = useFieldErrors(issues);

  const patch = (values: Partial<AdjustmentDraft>) => {
    touch(...(Object.keys(values) as (keyof AdjustmentDraft)[]));
    setDraft((current) => ({ ...current, ...values }));
  };

  const submit = () => {
    if (!attempt() || save.isPending) return;
    save.mutate(
      { id: editingId, draft },
      {
        onSuccess: () => {
          toast.success(editingId ? "Capital improvement updated" : "Capital improvement added");
          onOpenChange(false);
        },
        onError: (failure) =>
          toast.error(apiErrorMessage(failure, "Couldn't save the capital improvement.")),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? "Edit capital improvement" : "Add capital improvement"}
      description="Major upgrades that add to the property's value are added to its cost base. Selling costs are entered when you record the sale."
      submitLabel={editingId ? "Save changes" : "Add improvement"}
      pending={save.isPending}
      onSubmit={submit}
      size="sm"
    >
      <Field label="Date" required error={error("date")}>
        <DatePicker
          label="Improvement date"
          value={draft.date}
          onChange={(date) => patch({ date })}
          fromDate={parseIsoDate(property.purchaseDate)}
          toDate={new Date()}
        />
      </Field>
      <Field label="Amount" htmlFor="adjustment-amount" required error={error("amount")}>
        <PropertyMoneyInput
          id="adjustment-amount"
          label="Amount"
          value={draft.amount}
          onChange={(amount) => patch({ amount })}
          invalid={!!error("amount")}
          placeholder="0.00"
        />
      </Field>
      <Field label="Description" htmlFor="adjustment-description" required error={error("description")}>
        <Textarea
          id="adjustment-description"
          value={draft.description}
          onChange={(event) => patch({ description: event.target.value })}
          rows={3}
          maxLength={500}
          placeholder="e.g. Kitchen renovation"
        />
      </Field>
    </FormDialog>
  );
}

function BreakdownRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-t border-border py-2.5 first:border-t-0",
        strong && "font-semibold",
      )}
    >
      <dt className={cn("text-sm", !strong && "text-muted-foreground")}>{label}</dt>
      <dd className="text-sm tabular">{value}</dd>
    </div>
  );
}

export function CostBaseTab({ property }: { property: Property }) {
  const money = usePropertyMoney();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const stats = useCostBaseStatsQuery(property.id);
  const query = useCostBaseAdjustmentsQuery(property.id, page, pageSize);
  const remove = useDeleteAdjustmentMutation(property.id);
  const [form, setForm] = React.useState<{ adjustment: CostBaseAdjustment | null } | null>(null);
  const [deleting, setDeleting] = React.useState<CostBaseAdjustment | null>(null);
  const readOnly = property.status === "disposed";

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  React.useEffect(() => {
    if (!query.isPlaceholderData && page > pageCount) setPage(pageCount);
  }, [query.isPlaceholderData, page, pageCount]);

  return (
    <div className="space-y-4">
      <ModuleCard
        title="Cost base"
        description="What you paid for the property, plus capital improvements. It's the figure your capital gain is measured against."
      >
        <Loadable query={stats} skeletonClassName="h-48">
          {(data) => (
            <dl className="max-w-xl">
              <BreakdownRow label="Purchase price" value={money(property.purchasePrice)} />
              <BreakdownRow label="Stamp duty" value={money(property.stampDuty)} />
              <BreakdownRow label="Legal / settlement costs" value={money(property.legalCosts)} />
              <BreakdownRow
                label="Buyer agent / acquisition costs"
                value={money(property.buyerAgentCosts)}
              />
              <BreakdownRow label="Capital improvements" value={money(data.capitalImprovements)} />
              <BreakdownRow label="Total cost base" value={money(data.costBaseTotal)} strong />
            </dl>
          )}
        </Loadable>
      </ModuleCard>

      <ModuleCard
        title="Capital improvements"
        description="Upgrades that add to the cost base. Everyday repairs belong in Maintenance and Expenses."
        action={
          <Button size="sm" disabled={readOnly} onClick={() => setForm({ adjustment: null })}>
            <Plus />
            Add improvement
          </Button>
        }
      >
        <Loadable query={query} skeletonClassName="h-40">
          {(data) =>
            data.total === 0 ? (
              <ModuleEmpty
                icon={<Hammer aria-hidden />}
                title="No capital improvements"
                description="Record renovations and major upgrades to keep your cost base accurate."
                action={
                  !readOnly && (
                    <Button size="sm" onClick={() => setForm({ adjustment: null })}>
                      <Plus />
                      Add improvement
                    </Button>
                  )
                }
              />
            ) : (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={HUG_COLUMN}>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className={cn(HUG_COLUMN, "text-right")}>Amount</TableHead>
                        <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((adjustment) => (
                        <TableRow key={adjustment.id}>
                          <TableCell className={cn(HUG_COLUMN, "tabular text-muted-foreground")}>
                            {formatPropertyDate(adjustment.date)}
                          </TableCell>
                          <TableCell className="max-w-[320px]">
                            <span className="block truncate font-medium">{adjustment.description}</span>
                          </TableCell>
                          <TableCell className={cn(HUG_COLUMN, "text-right font-medium tabular")}>
                            {money(adjustment.amount)}
                          </TableCell>
                          <TableCell className={HUG_COLUMN}>
                            <div className="flex justify-end">
                              <RowMenu label={`Actions for ${adjustment.description}`}>
                                <MenuAction
                                  icon={<Pencil />}
                                  label="Edit"
                                  onSelect={() => setForm({ adjustment })}
                                  disabledReason={readOnly ? READ_ONLY_REASON : undefined}
                                />
                                <MenuAction
                                  icon={<Trash2 />}
                                  label="Delete"
                                  destructive
                                  onSelect={() => setDeleting(adjustment)}
                                  disabledReason={readOnly ? READ_ONLY_REASON : undefined}
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
                  itemLabel="improvement"
                  navLabel="Capital improvements pages"
                  disabled={query.isPlaceholderData}
                />
              </div>
            )
          }
        </Loadable>
      </ModuleCard>

      {form && (
        <AdjustmentForm
          initial={form.adjustment ? draftFromAdjustment(form.adjustment) : emptyAdjustmentDraft()}
          editingId={form.adjustment?.id ?? null}
          property={property}
          open
          onOpenChange={(open) => !open && setForm(null)}
        />
      )}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete capital improvement?"
        description={
          deleting
            ? `This removes “${deleting.description}” (${money(deleting.amount)}) from the cost base. This action can't be undone.`
            : ""
        }
        confirmLabel="Delete improvement"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Capital improvement deleted");
              setDeleting(null);
            },
            onError: (failure) =>
              toast.error(apiErrorMessage(failure, "Couldn't delete the capital improvement.")),
          });
        }}
      />
    </div>
  );
}
