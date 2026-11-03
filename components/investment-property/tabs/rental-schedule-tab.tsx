"use client";

import * as React from "react";
import { CalendarClock, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MenuAction } from "@/components/ui/menu-action";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  invalidClass,
  useFieldErrors,
  PropertyMoneyInput,
  usePropertyMoney,
} from "@/components/investment-property/module-shared";
import {
  useDeleteScheduleMutation,
  useRentalSchedulesQuery,
  useSaveScheduleMutation,
  useSetScheduleActiveMutation,
} from "@/hooks/use-property-modules-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatPropertyDate, type Property } from "@/lib/investment-property";
import {
  RENT_FREQUENCIES,
  draftFromSchedule,
  emptyScheduleDraft,
  frequencyShort,
  rentFrequencyLabel,
  scheduleIssues,
  type RentFrequency,
  type RentalSchedule,
  type ScheduleDraft,
} from "@/lib/investment-property-rental";
import { parseIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

const READ_ONLY_REASON = "Sold properties are read-only.";

function ScheduleForm({
  initial,
  editingId,
  hasOtherActive,
  open,
  onOpenChange,
  propertyId,
}: {
  initial: ScheduleDraft;
  editingId: string | null;
  hasOtherActive: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
}) {
  const save = useSaveScheduleMutation(propertyId);
  const [draft, setDraft] = React.useState<ScheduleDraft>(initial);
  const issues = scheduleIssues(draft);
  const { error, touch, attempt } = useFieldErrors(issues);

  const patch = (values: Partial<ScheduleDraft>) => {
    touch(...(Object.keys(values) as (keyof ScheduleDraft)[]));
    setDraft((current) => ({ ...current, ...values }));
  };

  const submit = () => {
    if (!attempt() || save.isPending) return;
    save.mutate(
      { id: editingId, draft },
      {
        onSuccess: () => {
          toast.success(editingId ? "Rental schedule updated" : "Rental schedule created");
          onOpenChange(false);
        },
        onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't save the rental schedule.")),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? "Edit rental schedule" : "Add rental schedule"}
      description="Sole creates a pending income entry each time rent falls due while the schedule is active."
      submitLabel={editingId ? "Save changes" : "Create schedule"}
      pending={save.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rent amount" htmlFor="schedule-rent" required error={error("rentAmount")}>
          <PropertyMoneyInput
            id="schedule-rent"
            label="Rent amount"
            value={draft.rentAmount}
            onChange={(rentAmount) => patch({ rentAmount })}
            invalid={!!error("rentAmount")}
            placeholder="0.00"
          />
        </Field>
        <Field label="Frequency" required>
          <Select value={draft.frequency} onValueChange={(value) => patch({ frequency: value as RentFrequency })}>
            <SelectTrigger aria-label="Rent frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RENT_FREQUENCIES.map((frequency) => (
                <SelectItem key={frequency.value} value={frequency.value}>
                  {frequency.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Rent start date" required error={error("startDate")}>
          <DatePicker
            label="Rent start date"
            value={draft.startDate}
            onChange={(startDate) => patch({ startDate })}
          />
        </Field>
        <Field label="Rent end date" error={error("endDate")} hint="Leave blank for an ongoing lease.">
          <DatePicker
            label="Rent end date"
            value={draft.endDate}
            onChange={(endDate) => patch({ endDate })}
            fromDate={parseIsoDate(draft.startDate)}
          />
        </Field>
        <Field
          label="Expected payment day"
          htmlFor="schedule-day"
          hint="Day of the month rent is expected. Defaults to the start date's day."
          error={error("paymentDay")}
        >
          <Input
            id="schedule-day"
            inputMode="numeric"
            value={draft.paymentDay}
            onChange={(event) => patch({ paymentDay: event.target.value })}
            placeholder="1–31"
            aria-invalid={!!error("paymentDay")}
            className={invalidClass(error("paymentDay"))}
          />
        </Field>
        <Field label="Next rent increase" error={error("increaseDate")}>
          <DatePicker
            label="Next rent increase"
            value={draft.increaseDate}
            onChange={(increaseDate) => patch({ increaseDate })}
          />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/30 p-3">
        <div>
          <p className="text-sm font-medium">Managed by an agent</p>
          <p className="text-xs text-muted-foreground">Tick if a property manager collects the rent.</p>
        </div>
        <Switch
          checked={draft.agentManaged}
          onCheckedChange={(agentManaged) => patch({ agentManaged })}
          aria-label="Managed by an agent"
        />
      </div>
      {draft.agentManaged && (
        <Field label="Agent name" htmlFor="schedule-agent" error={error("agentName")}>
          <Input
            id="schedule-agent"
            value={draft.agentName}
            onChange={(event) => patch({ agentName: event.target.value })}
            placeholder="e.g. Ray White Hawthorn"
            maxLength={255}
          />
        </Field>
      )}

      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/30 p-3">
        <div>
          <p className="text-sm font-medium">Active</p>
          <p className="text-xs text-muted-foreground">
            {hasOtherActive && draft.active
              ? "Only one schedule can be active — saving will deactivate the current one."
              : "Inactive schedules don't create income."}
          </p>
        </div>
        <Switch
          checked={draft.active}
          onCheckedChange={(active) => patch({ active })}
          aria-label="Active"
        />
      </div>

      <Field label="Notes" htmlFor="schedule-notes">
        <Textarea
          id="schedule-notes"
          value={draft.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          rows={3}
          placeholder="Tenant names, bond details, lease terms…"
        />
      </Field>
    </FormDialog>
  );
}

export function RentalScheduleTab({ property }: { property: Property }) {
  const money = usePropertyMoney();
  const query = useRentalSchedulesQuery(property.id);
  const setActive = useSetScheduleActiveMutation();
  const remove = useDeleteScheduleMutation();
  const [form, setForm] = React.useState<{ schedule: RentalSchedule | null } | null>(null);
  const [deleting, setDeleting] = React.useState<RentalSchedule | null>(null);
  const readOnly = property.status === "disposed";

  return (
    <ModuleCard
      title="Rental schedule"
      description="The lease terms that drive expected rent. Only one schedule is active at a time."
      action={
        <Button size="sm" disabled={readOnly} onClick={() => setForm({ schedule: null })}>
          <Plus />
          Add schedule
        </Button>
      }
    >
      <Loadable query={query} skeletonClassName="h-48">
        {(schedules) =>
          schedules.length === 0 ? (
            <ModuleEmpty
              icon={<CalendarClock aria-hidden />}
              title="No rental schedule"
              description="Add the lease terms and Sole will create an income entry each time rent falls due."
              action={
                !readOnly && (
                  <Button size="sm" onClick={() => setForm({ schedule: null })}>
                    <Plus />
                    Add schedule
                  </Button>
                )
              }
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={HUG_COLUMN}>Status</TableHead>
                    <TableHead className={cn(HUG_COLUMN, "text-right")}>Rent</TableHead>
                    <TableHead className={HUG_COLUMN}>Starts</TableHead>
                    <TableHead className={HUG_COLUMN}>Ends</TableHead>
                    <TableHead className={HUG_COLUMN}>Pay day</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className={HUG_COLUMN}>Next increase</TableHead>
                    <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell className={HUG_COLUMN}>
                        <Badge variant={schedule.active ? "success" : "secondary"}>
                          {schedule.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
                        <span className="font-medium">{money(schedule.rentAmount)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {rentFrequencyLabel(schedule.frequency)} · {frequencyShort(schedule.frequency)}
                        </span>
                      </TableCell>
                      <TableCell className={cn(HUG_COLUMN, "tabular text-muted-foreground")}>
                        {formatPropertyDate(schedule.startDate)}
                      </TableCell>
                      <TableCell className={cn(HUG_COLUMN, "tabular text-muted-foreground")}>
                        {schedule.endDate ? formatPropertyDate(schedule.endDate) : "Ongoing"}
                      </TableCell>
                      <TableCell className={cn(HUG_COLUMN, "tabular")}>{schedule.paymentDay ?? "—"}</TableCell>
                      <TableCell className="max-w-[180px] text-muted-foreground">
                        <span className="block truncate">
                          {schedule.agentManaged ? schedule.agentName || "Agent managed" : "Self managed"}
                        </span>
                      </TableCell>
                      <TableCell className={cn(HUG_COLUMN, "tabular text-muted-foreground")}>
                        {schedule.increaseDate ? formatPropertyDate(schedule.increaseDate) : "—"}
                      </TableCell>
                      <TableCell className={HUG_COLUMN}>
                        <div className="flex justify-end">
                          <RowMenu label={`Actions for the ${money(schedule.rentAmount)} schedule`}>
                            <MenuAction
                              icon={<Pencil />}
                              label="Edit"
                              onSelect={() => setForm({ schedule })}
                              disabledReason={readOnly ? READ_ONLY_REASON : undefined}
                            />
                            <MenuAction
                              icon={schedule.active ? <Pause /> : <Play />}
                              label={schedule.active ? "Deactivate" : "Activate"}
                              disabledReason={readOnly ? READ_ONLY_REASON : undefined}
                              onSelect={() =>
                                setActive.mutate(
                                  { id: schedule.id, active: !schedule.active },
                                  {
                                    onSuccess: () =>
                                      toast.success(schedule.active ? "Schedule deactivated" : "Schedule activated"),
                                    onError: (failure) =>
                                      toast.error(apiErrorMessage(failure, "Couldn't update the schedule.")),
                                  },
                                )
                              }
                            />
                            <MenuAction
                              icon={<Trash2 />}
                              label="Delete"
                              destructive
                              onSelect={() => setDeleting(schedule)}
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
          )
        }
      </Loadable>

      {form && (
        <ScheduleForm
          initial={
            form.schedule
              ? draftFromSchedule(form.schedule)
              : { ...emptyScheduleDraft(), active: !(query.data ?? []).some((schedule) => schedule.active) }
          }
          editingId={form.schedule?.id ?? null}
          hasOtherActive={(query.data ?? []).some(
            (schedule) => schedule.active && schedule.id !== form.schedule?.id,
          )}
          open
          onOpenChange={(open) => !open && setForm(null)}
          propertyId={property.id}
        />
      )}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete rental schedule?"
        description="This stops future rent entries being created from this schedule. Income already recorded is kept. This action can't be undone."
        confirmLabel="Delete schedule"
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Rental schedule deleted");
              setDeleting(null);
            },
            onError: (failure) => toast.error(apiErrorMessage(failure, "Couldn't delete the schedule.")),
          });
        }}
      />
    </ModuleCard>
  );
}
