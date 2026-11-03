"use client";

import * as React from "react";
import { History, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import {
  ConfirmDeleteDialog,
  FormDialog,
  Loadable,
  ModuleCard,
  ModuleEmpty,
  useFieldErrors,
} from "@/components/investment-property/module-shared";
import {
  useDeleteUseHistoryMutation,
  useSaveUseHistoryMutation,
  useUseHistoryQuery,
} from "@/hooks/use-property-modules-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatPropertyDate, type Property } from "@/lib/investment-property";
import {
  availableUseTypes,
  draftFromEntry,
  emptyUseHistoryDraft,
  usagePeriodIssues,
  usageLabel,
  type NominationChoice,
  type UseHistoryDraft,
  type UseHistoryEntry,
  type UseType,
} from "@/lib/investment-property-use-history";
import { parseIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

const NOMINATION_OPTIONS: { value: NominationChoice; label: string }[] = [
  { value: "unset", label: "Not sure" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

function dayAfter(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return "";
  date.setDate(date.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function PeriodForm({
  initial,
  editingId,
  entries,
  property,
  open,
  onOpenChange,
}: {
  initial: UseHistoryDraft;
  editingId: string | null;
  entries: UseHistoryEntry[];
  property: Property;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveUseHistoryMutation(property.id);
  const [draft, setDraft] = React.useState<UseHistoryDraft>(initial);
  const issues = usagePeriodIssues(draft, property.ownershipEntity, entries, editingId);
  const { error, touch, attempt } = useFieldErrors(issues);

  const patch = (values: Partial<UseHistoryDraft>) => {
    touch(...(Object.keys(values) as (keyof UseHistoryDraft)[]));
    setDraft((current) => ({ ...current, ...values }));
  };

  const submit = () => {
    if (!attempt() || save.isPending) return;
    save.mutate(
      { id: editingId, draft },
      {
        onSuccess: () => {
          toast.success(editingId ? "Period updated" : "Period added");
          onOpenChange(false);
        },
        onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't save the period.")),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? "Edit use period" : "Add use period"}
      description="How the property was used over time. Periods can't overlap."
      submitLabel={editingId ? "Save changes" : "Add period"}
      pending={save.isPending}
      onSubmit={submit}
      size="sm"
    >
      <Field label="Use" required error={error("useType")}>
        <Select value={draft.useType} onValueChange={(value) => patch({ useType: value as UseType })}>
          <SelectTrigger aria-label="Use type" aria-invalid={!!error("useType")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableUseTypes(property.ownershipEntity).map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" required error={error("startDate")}>
          <DatePicker label="Period start date" value={draft.startDate} onChange={(startDate) => patch({ startDate })} />
        </Field>
        <Field label="End date" error={error("endDate")} hint="Leave blank if it's the current use.">
          <DatePicker
            label="Period end date"
            value={draft.endDate}
            onChange={(endDate) => patch({ endDate })}
            fromDate={parseIsoDate(draft.startDate)}
          />
        </Field>
      </div>
      {(draft.useType === "ppor" || draft.useType === "investment") && (
        <Field
          label="Another main residence nominated?"
          labelTip="Whether you nominated a different property as your main residence during this period. Your accountant uses this for the main residence exemption."
        >
          <RadioGroup
            value={draft.nomination}
            onValueChange={(value) => patch({ nomination: value as NominationChoice })}
            aria-label="Another main residence nominated"
            className="flex flex-wrap gap-5"
          >
            {NOMINATION_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value={option.value} aria-label={option.label} />
                {option.label}
              </label>
            ))}
          </RadioGroup>
        </Field>
      )}
      <Field label="Notes" htmlFor="period-notes">
        <Textarea
          id="period-notes"
          value={draft.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          rows={3}
          placeholder="Optional"
        />
      </Field>
    </FormDialog>
  );
}

export function UseHistoryTab({ property }: { property: Property }) {
  const query = useUseHistoryQuery(property.id);
  const remove = useDeleteUseHistoryMutation(property.id);
  const [form, setForm] = React.useState<{ entry: UseHistoryEntry | null } | null>(null);
  const [deleting, setDeleting] = React.useState<UseHistoryEntry | null>(null);
  const readOnly = property.status === "disposed";
  const entries = query.data?.entries ?? [];

  const openAdd = () => setForm({ entry: null });

  const addDefaults = (): UseHistoryDraft => {
    const last = entries[entries.length - 1];
    return emptyUseHistoryDraft(last?.endDate ? dayAfter(last.endDate) : "");
  };

  return (
    <ModuleCard
      title="Use history"
      description="Whether the property was your home, rented out or vacant over time. It shapes your CGT estimate."
      action={
        <Button size="sm" disabled={readOnly} onClick={openAdd}>
          <Plus />
          Add period
        </Button>
      }
    >
      <Loadable query={query} skeletonClassName="h-48">
        {(history) => (
          <div className="space-y-4">
            {[history.pporWarning, history.absenceWarning, history.gapWarning]
              .filter((message): message is string => Boolean(message))
              .map((message) => (
                <Alert key={message}>
                  <TriangleAlert className="size-4" aria-hidden />
                  <AlertTitle>Review with your accountant</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ))}

            {history.entries.length === 0 ? (
              <ModuleEmpty
                icon={<History aria-hidden />}
                title="No use periods"
                description="Add how this property has been used since you bought it."
                action={
                  !readOnly && (
                    <Button size="sm" onClick={openAdd}>
                      <Plus />
                      Add period
                    </Button>
                  )
                }
              />
            ) : (
              <ol className="relative space-y-3 border-l border-border pl-5">
                {history.entries.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[26px] top-4 size-2.5 rounded-full ring-4 ring-card",
                        entry.useType === "ppor"
                          ? "bg-warning"
                          : entry.useType === "investment"
                            ? "bg-primary"
                            : "bg-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{usageLabel(entry.useType)}</p>
                          {entry.endDate === "" && <Badge variant="success">Current</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground tabular">
                          {formatPropertyDate(entry.startDate)} –{" "}
                          {entry.endDate ? formatPropertyDate(entry.endDate) : "present"}
                        </p>
                        {entry.otherResidenceNominated !== null && (
                          <p className="text-xs text-muted-foreground">
                            Another main residence nominated: {entry.otherResidenceNominated ? "yes" : "no"}
                          </p>
                        )}
                        {entry.notes && <p className="text-sm">{entry.notes}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Edit ${usageLabel(entry.useType)} period`}
                          disabled={readOnly}
                          onClick={() => setForm({ entry })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${usageLabel(entry.useType)} period`}
                          disabled={readOnly || history.entries.length <= 1}
                          title={
                            history.entries.length <= 1
                              ? "At least one period must remain on the timeline."
                              : undefined
                          }
                          onClick={() => setDeleting(entry)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </Loadable>

      {form && (
        <PeriodForm
          initial={form.entry ? draftFromEntry(form.entry) : addDefaults()}
          editingId={form.entry?.id ?? null}
          entries={entries}
          property={property}
          open
          onOpenChange={(open) => !open && setForm(null)}
        />
      )}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete use period?"
        description={
          deleting
            ? `This removes the ${usageLabel(deleting.useType).toLowerCase()} period starting ${formatPropertyDate(deleting.startDate)}. This may leave a gap in the timeline.`
            : ""
        }
        confirmLabel="Delete period"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Period deleted");
              setDeleting(null);
            },
            onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't delete the period.")),
          });
        }}
      />
    </ModuleCard>
  );
}
