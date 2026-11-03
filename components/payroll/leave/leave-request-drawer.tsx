"use client";

import * as React from "react";
import { CalendarDays, Clock, NotebookPen, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Shimmer } from "@/components/ui/shimmer";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Required } from "@/components/documents/field";
import { DatePicker } from "@/components/documents/date-picker";
import {
  useCreateLeaveRequestMutation,
  usePayrollLeaveEmployeesQuery,
  usePayrollLeaveRequestQuery,
  useUpdateLeaveRequestMutation,
} from "@/hooks/use-payroll-leave-query";
import { apiErrorMessage } from "@/lib/api-error";
import { parseIsoDate } from "@/lib/invoices";
import {
  LEAVE_FORM_DEFAULTS,
  LEAVE_HOURS_PER_DAY,
  LEAVE_TYPES,
  calcLeaveDuration,
  leaveFormFromRequest,
  leaveRequestSchema,
  leaveDurationLabel,
  type LeaveEmployeeOption,
  type LeaveRequestFormValues,
} from "@/lib/payroll-leave";
import { cn } from "@/lib/utils";

/**
 * Raises a leave request, or edits one — sole-webapp's
 * `CreateLeaveRequestDrawer`, field for field.
 *
 * The employee can't be changed on an edit: a request belongs to the person it
 * was raised for, and moving it would rewrite someone else's leave history.
 */
export function LeaveRequestDrawer({
  open,
  editId,
  onOpenChange,
}: {
  open: boolean;
  /** The request being edited, or null for a new one. */
  editId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const employeesQuery = usePayrollLeaveEmployeesQuery(open);
  const detailQuery = usePayrollLeaveRequestQuery(open ? editId : null);
  const editing = editId ? detailQuery.data : undefined;
  const loadingDetail = !!editId && detailQuery.isPending;
  const createRequest = useCreateLeaveRequestMutation();
  const updateRequest = useUpdateLeaveRequestMutation();
  const saving = createRequest.isPending || updateRequest.isPending;
  /*
   * The server only moves the dates of a pending request — on approved leave
   * it accepts the edit and quietly keeps the old dates. Locked here instead,
   * so nobody believes they've moved leave that hasn't moved.
   */
  const datesLocked = editing?.status === "APPROVED";

  const form = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(leaveRequestSchema),
    // Errors surface once a field has been left, then track live as it's fixed.
    mode: "onTouched",
    defaultValues: LEAVE_FORM_DEFAULTS,
  });

  // Reload the form whenever the drawer opens or switches record.
  React.useEffect(() => {
    if (!open) return;
    if (!editId) {
      form.reset(LEAVE_FORM_DEFAULTS);
      return;
    }
    // Still loading the real record — the effect re-runs once it lands.
    if (!editing) return;
    form.reset(leaveFormFromRequest(editing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId, editing]);

  // A request that can't be fetched can't be edited — closing beats leaving
  // the drawer open on a blank form pretending to be the real one.
  React.useEffect(() => {
    if (open && editId && detailQuery.isError) {
      toast.error("Couldn't load that leave request. Try again.");
      onOpenChange(false);
    }
  }, [open, editId, detailQuery.isError, onOpenChange]);

  /*
   * The picker lists whoever `GET /employees?limit=100` returns. An edited
   * request's own employee is added if they aren't among them (past the first
   * hundred, or since removed), so the disabled select still names them.
   */
  const employees = React.useMemo<LeaveEmployeeOption[]>(() => {
    const list = employeesQuery.data ?? [];
    if (!editing || list.some((entry) => entry.id === editing.employeeId)) {
      return list;
    }
    return [{ id: editing.employeeId, name: editing.employeeName }, ...list];
  }, [employeesQuery.data, editing]);

  const values = form.watch();
  const duration = calcLeaveDuration(values);
  const haveDates = !!values.startDate && !!values.endDate;

  const close = () => onOpenChange(false);

  const onSubmit = async (submitted: LeaveRequestFormValues) => {
    try {
      if (editId) {
        await updateRequest.mutateAsync({ id: editId, values: submitted });
        toast.success("Leave request updated successfully.");
      } else {
        await createRequest.mutateAsync(submitted);
        toast.success("Leave request created successfully.");
      }
      close();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save leave request."));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="space-y-1 border-b p-6 text-left">
          <SheetTitle>
            {editId ? "Edit leave request" : "New leave request"}
          </SheetTitle>
          <SheetDescription>
            Record leave for approval and payroll tracking.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
              {loadingDetail ? (
                <div className="space-y-6" aria-hidden>
                  <Shimmer className="h-40 w-full rounded-lg border border-border" />
                  <Shimmer className="h-64 w-full rounded-lg border border-border" />
                  <Shimmer className="h-40 w-full rounded-lg border border-border" />
                </div>
              ) : (
                <>
                  <FormSection icon={UserRound} title="Employee and leave type">
                    <FormField
                      control={form.control}
                      name="employeeId"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>
                            Employee
                            <Required />
                          </FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={(next) => {
                              field.onChange(next);
                              field.onBlur();
                            }}
                            disabled={!!editId || employeesQuery.isPending}
                          >
                            <FormControl>
                              <SelectTrigger
                                onBlur={field.onBlur}
                                className={cn(
                                  fieldState.error && "border-destructive",
                                )}
                              >
                                <SelectValue
                                  placeholder={
                                    employeesQuery.isPending
                                      ? "Loading employees…"
                                      : employeesQuery.isError
                                        ? "Couldn't load employees"
                                        : employees.length === 0
                                          ? "No employees yet"
                                          : "Select employee"
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {employees.map((employee) => (
                                <SelectItem key={employee.id} value={employee.id}>
                                  {employee.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {editId && (
                            <p className="text-xs text-muted-foreground">
                              A request stays with the employee it was raised for.
                            </p>
                          )}
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="leaveType"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>
                            Leave type
                            <Required />
                          </FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger
                                className={cn(
                                  fieldState.error && "border-destructive",
                                )}
                              >
                                <SelectValue placeholder="Select leave type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {LEAVE_TYPES.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </FormSection>

                  <FormSection icon={CalendarDays} title="Dates">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Start date
                              <Required />
                            </FormLabel>
                            <FormControl>
                              <DatePicker
                                disabled={datesLocked}
                                value={field.value}
                                label="Start date"
                                onChange={(next) => {
                                  // A one-day request is the common case, so
                                  // an empty end date follows the start.
                                  if (!form.getValues("endDate")) {
                                    form.setValue("endDate", next, {
                                      shouldDirty: true,
                                    });
                                  }
                                  // The picker has no blur of its own, so a
                                  // pick is what counts as leaving the field.
                                  form.setValue("startDate", next, {
                                    shouldDirty: true,
                                    shouldTouch: true,
                                    shouldValidate: true,
                                  });
                                  if (form.getFieldState("endDate").isTouched) {
                                    void form.trigger("endDate");
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="endDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              End date
                              <Required />
                            </FormLabel>
                            <FormControl>
                              <DatePicker
                                disabled={datesLocked}
                                value={field.value}
                                label="End date"
                                fromDate={parseIsoDate(values.startDate)}
                                onChange={(next) =>
                                  form.setValue("endDate", next, {
                                    shouldDirty: true,
                                    shouldTouch: true,
                                    shouldValidate: true,
                                  })
                                }
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="fullDay"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4 space-y-0 rounded-md border border-border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Full day</FormLabel>
                            <p className="text-xs text-muted-foreground">
                              Turn off to record part of a day.
                            </p>
                          </div>
                          <FormControl>
                            <Switch
                              disabled={datesLocked}
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {!values.fullDay && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TimeField
                          form={form}
                          name="startTime"
                          label="Start time"
                          disabled={datesLocked}
                        />
                        <TimeField
                          form={form}
                          name="endTime"
                          label="End time"
                          disabled={datesLocked}
                        />
                      </div>
                    )}

                    {datesLocked && (
                      <p className="text-xs text-muted-foreground">
                        Approved leave keeps its dates. To change them, cancel
                        this request and raise a new one.
                      </p>
                    )}

                    <div
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2.5"
                      aria-live="polite"
                    >
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">Calculated duration</p>
                        <p className="text-xs text-muted-foreground">
                          Weekdays only, at {LEAVE_HOURS_PER_DAY} hours a day.
                          Public holidays aren&apos;t taken off.
                        </p>
                      </div>
                      <p className="flex items-center gap-1.5 text-sm font-semibold tabular">
                        <Clock className="size-4 text-muted-foreground" aria-hidden />
                        {haveDates ? leaveDurationLabel(duration) : "Pick the dates"}
                      </p>
                    </div>
                  </FormSection>

                  <FormSection icon={NotebookPen} title="Notes">
                    <FormField
                      control={form.control}
                      name="comments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Comments</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={3}
                              placeholder="A reason, a medical certificate reference, or anything payroll should know"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="agreedToTerms"
                      render={({ field }) => (
                        <FormItem className="flex items-start gap-2.5 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) =>
                                field.onChange(checked === true)
                              }
                              className="mt-0.5"
                            />
                          </FormControl>
                          <FormLabel className="cursor-pointer text-sm font-normal leading-normal text-muted-foreground">
                            I confirm this request complies with the company&apos;s
                            leave policy and award conditions.
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </FormSection>
                </>
              )}
            </div>

            <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={loadingDetail || saving}>
                {saving
                  ? "Saving…"
                  : editId
                    ? "Save changes"
                    : "Submit request"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

type FormType = ReturnType<typeof useForm<LeaveRequestFormValues>>;

/** One of the part-day times — a native time input, as sole-webapp used. */
function TimeField({
  form,
  name,
  label,
  disabled,
}: {
  form: FormType;
  name: "startTime" | "endTime";
  label: string;
  disabled?: boolean;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>
            {label}
            <Required />
          </FormLabel>
          <FormControl>
            <Input
              type="time"
              {...field}
              disabled={disabled}
              onChange={(event) => {
                field.onChange(event);
                // The two times are checked against each other, so changing
                // either re-checks the end once it has been touched.
                if (form.getFieldState("endTime").isTouched) {
                  void form.trigger("endTime");
                }
              }}
              className={cn(
                "tabular",
                fieldState.error &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}
