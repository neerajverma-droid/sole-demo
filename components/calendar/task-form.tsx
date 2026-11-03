"use client";

import * as React from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  ListChecks,
  Loader2,
  Paperclip,
  RefreshCw,
  BriefcaseBusiness,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CONTROL_SURFACE_TRIGGER } from "@/components/ui/control-surface";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { TimePicker } from "@/components/documents/time-picker";
import {
  MultiAttachmentUpload,
  type MultiAttachmentRow,
} from "@/components/shared/multi-attachment-upload";
import {
  useCalendarContactsQuery,
  useCalendarEventsCache,
  useClientProjectsQuery,
  usePlannerStagesQuery,
  useProjectJobsQuery,
} from "@/hooks/use-calendar-query";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { apiErrorMessage } from "@/lib/api-error";
import { createCalendarTask, updateCalendarTask } from "@/lib/calendar-api";
import {
  FREQ_OPTIONS,
  PRIORITY_OPTIONS,
  TASK_LABEL_OPTIONS,
  WEEKDAYS,
  buildTaskPayload,
  eventDocumentsSource,
  eventSaveId,
  getDefaultTaskValues,
  isRecurringParentTask,
  mapEventDocuments,
  normalizeSavedTask,
  taskRequestFields,
  validateTask,
  type CalendarContact,
  type CalendarUser,
  type RawCalendarEvent,
  type TaskFormValues,
} from "@/lib/calendar";
import { deleteSourceDocument, uploadSourceDocument } from "@/lib/file-upload";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

type Errors = Partial<Record<keyof TaskFormValues, string>>;

/** The source type documents are filed under, as UploadMulipleShadcn sent it. */
const DOCUMENT_SOURCE = "calendar";

function readFilesAsDataUrls(files: File[]): Promise<string[]> {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        }),
    ),
  );
}

/**
 * The expense form's date picker beside a matching time picker, over one
 * `YYYY-MM-DDTHH:mm` value. The time waits for a date, as before.
 */
function DateTimeInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const [date = "", time = ""] = value ? value.split("T") : [];
  const compose = (nextDate: string, nextTime: string) =>
    onChange(nextDate ? `${nextDate}T${nextTime || "00:00"}` : "");
  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">
        <DatePicker
          id={id}
          label="Date"
          value={date}
          invalid={invalid}
          onChange={(nextDate) => compose(nextDate, time)}
        />
      </div>
      <TimePicker
        value={time.slice(0, 5)}
        invalid={invalid}
        disabled={!date}
        onChange={(nextTime) => compose(date, nextTime)}
        className="w-[136px] shrink-0"
      />
    </div>
  );
}

/** Shown inside a dropdown with nothing to pick, instead of an empty sliver. */
function SelectEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-6 text-center text-sm text-muted-foreground">{children}</div>
  );
}

/** A card-style radio, the design's `.seg` — used for Personal / Business. */
function SegmentCard({
  active,
  title,
  hint,
  onSelect,
}: {
  active: boolean;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent/50",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-normal text-muted-foreground">{hint}</span>
      </span>
      <span className="grid size-4 shrink-0 place-items-center rounded-full border border-primary">
        {active && <span className="size-2 rounded-full bg-primary" />}
      </span>
    </button>
  );
}

function SwitchRow({
  title,
  hint,
  checked,
  onCheckedChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-border bg-muted/30 p-3">
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

/** Find a contact by name or email — `/contact/list`, so both its ids come with it. */
function ContactPicker({
  value,
  onChange,
  invalid,
}: {
  value: CalendarContact | null;
  onChange: (contact: CalendarContact | null) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const contactsQuery = useCalendarContactsQuery(true);
  const contacts = contactsQuery.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            CONTROL_SURFACE_TRIGGER,
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            invalid && "border-destructive",
          )}
        >
          <span className="truncate">{value?.label || "Find a contact"}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search contacts…" />
          <CommandList>
            <CommandEmpty>
              {contactsQuery.isLoading ? "Loading contacts…" : "No contacts found"}
            </CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  Clear selection
                </CommandItem>
              )}
              {contacts.map((contact) => (
                <CommandItem
                  key={`${contact.client_id}-${contact.contact_id}`}
                  value={`${contact.label} ${contact.email} ${contact.value}`}
                  onSelect={() => {
                    onChange(contact);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{contact.label || "Unnamed contact"}</p>
                    {contact.email && (
                      <p className="truncate text-xs text-muted-foreground">{contact.email}</p>
                    )}
                  </div>
                  {value?.value === contact.value && <Check className="size-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Add or edit a task — the design's full-page form over the old calendar's
 * AddTask behaviour. Same fields, same rules (ProjectCalendarTaskSchema),
 * same FormData to `POST /calendar` and `PUT /calendar/:id`.
 */
export function TaskForm({
  mode,
  taskData,
  initialDateTime,
  initialStageId,
  backLabel = "Calendar",
  fallbackUser,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  taskData: RawCalendarEvent | null;
  initialDateTime: Date | null;
  /** Pre-selects the Status — the planner's per-column add. */
  initialStageId?: string | null;
  /** Where the back link returns to — "Calendar" or "Planner". */
  backLabel?: string;
  fallbackUser: CalendarUser;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const creating = mode !== "edit";
  const recordId = taskData?.id ?? taskData?.task_id ?? undefined;
  const [values, setValues] = React.useState<TaskFormValues>(() =>
    getDefaultTaskValues({ taskData, initialDateTime, initialStageId }),
  );
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, setSaving] = React.useState(false);
  const updateEventsCache = useCalendarEventsCache();

  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  /* --- Lookups --- */

  const stagesQuery = usePlannerStagesQuery(true);
  const stages = React.useMemo(() => stagesQuery.data ?? [], [stagesQuery.data]);
  // A new task opens on a Status, as AddTask's fetchPlannerStages did: the
  // column it was added from, else Backlog, else the first stage. A stage that
  // isn't on offer (the final one is left out) would leave the field blank, so
  // that falls back too. An edit keeps whatever stage the task is in.
  React.useEffect(() => {
    if (stages.length === 0) return;
    setValues((prev) => {
      const offered = stages.some((stage) => String(stage.id) === prev.stage_id);
      if (prev.stage_id && (offered || !creating)) return prev;
      const preferred =
        stages.find((stage) => String(stage?.name || "").trim().toLowerCase() === "backlog") ||
        stages[0];
      return preferred?.id ? { ...prev, stage_id: String(preferred.id) } : prev;
    });
  }, [stages, creating]);

  const clientKey = values.client?.client_id || values.client?.value || null;
  const projectsQuery = useClientProjectsQuery(clientKey);
  const jobsQuery = useProjectJobsQuery(values.project_id);
  const projects = values.client ? (projectsQuery.data ?? []) : [];
  const jobs = values.project_id ? (jobsQuery.data ?? []) : [];

  /* --- Attachments --- */

  const [pendingFiles, setPendingFiles] = React.useState<
    { key: string; file: File; previewUrl: string }[]
  >([]);
  const [attachmentRows, setAttachmentRows] = React.useState<MultiAttachmentRow[]>(() =>
    creating
      ? []
      : mapEventDocuments(eventDocumentsSource(taskData)).map((doc) => ({
          key: doc.documentId,
          name: doc.name,
          url: doc.url,
          status: "idle" as const,
        })),
  );

  const handleAddFiles = async (files: File[]) => {
    const previews = await readFilesAsDataUrls(files);
    if (creating || recordId === undefined) {
      setPendingFiles((current) => [
        ...current,
        ...files.map((file, index) => ({
          key: `pending_${Date.now()}_${index}`,
          file,
          previewUrl: previews[index],
        })),
      ]);
      return;
    }

    const placeholders: MultiAttachmentRow[] = files.map((file, index) => ({
      key: `uploading_${Date.now()}_${index}`,
      name: file.name,
      size: file.size,
      url: previews[index],
      status: "uploading",
    }));
    setAttachmentRows((current) => [...current, ...placeholders]);

    for (let index = 0; index < files.length; index += 1) {
      const placeholder = placeholders[index];
      try {
        const documentId = await uploadSourceDocument(DOCUMENT_SOURCE, recordId, files[index]);
        setAttachmentRows((current) =>
          current.map((row) =>
            row.key === placeholder.key ? { ...row, key: documentId ?? row.key, status: "idle" } : row,
          ),
        );
      } catch (error) {
        toast.error(apiErrorMessage(error, `Couldn't attach "${files[index].name}". Try again.`));
        setAttachmentRows((current) => current.filter((row) => row.key !== placeholder.key));
      }
    }
  };

  const handleRemoveFile = async (key: string) => {
    if (creating || recordId === undefined) {
      setPendingFiles((current) => current.filter((item) => item.key !== key));
      return;
    }
    setAttachmentRows((current) =>
      current.map((row) => (row.key === key ? { ...row, status: "deleting" } : row)),
    );
    try {
      await deleteSourceDocument(key);
      setAttachmentRows((current) => current.filter((row) => row.key !== key));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't remove that attachment. Try again."));
      setAttachmentRows((current) =>
        current.map((row) => (row.key === key ? { ...row, status: "idle" } : row)),
      );
    }
  };

  const attachmentsBusy = attachmentRows.some((row) => row.status !== "idle");

  /* --- Save --- */

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateTask(values, { creating });
    const firstError = (Object.keys(nextErrors) as (keyof TaskFormValues)[]).find(
      (key) => nextErrors[key],
    );
    if (firstError) {
      setErrors(nextErrors);
      document
        .getElementById(`task-${firstError}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSaving(true);
    try {
      const payload = buildTaskPayload(values, { creating });
      const fields = taskRequestFields(payload);

      if (!creating && recordId !== undefined) {
        const saved = await updateCalendarTask(recordId, fields);
        const normalized = normalizeSavedTask(saved, payload, fallbackUser);
        const saveId = eventSaveId(normalized);
        updateEventsCache((rows) =>
          rows.map((row) =>
            String(row.task_id || row.id) === saveId ? { ...row, ...normalized } : row,
          ),
        );
      } else {
        const saved = await createCalendarTask(
          fields,
          pendingFiles.map((item) => item.file),
        );
        updateEventsCache((rows) => [...rows, normalizeSavedTask(saved, payload, fallbackUser)]);
        track(EVENTS.CALENDAR_EVENT_CREATED, { timestamp: new Date().toISOString() });
      }

      toast.success(
        !creating
          ? "Task updated successfully"
          : values.repeat
            ? "Recurring event series created successfully"
            : "Task created successfully",
      );
      await onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, creating ? "Failed to create task" : "Failed to update task"));
    } finally {
      setSaving(false);
    }
  };

  const recurringParent = !creating && isRecurringParentTask(taskData);
  const billableClientRequired = values.task_id !== null && values.is_billable;
  const freqUnit =
    FREQ_OPTIONS.find((option) => option.value === values.recurrence_freq)?.unit ?? "week(s)";

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mx-auto flex max-w-3xl flex-col gap-6"
      data-usertour={creating ? "task-form-new" : undefined}
    >
      <Button type="button" variant="ghost" className="-ml-3 self-start" onClick={onClose}>
        <ArrowLeft />
        {backLabel}
      </Button>

      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          {creating ? "Add task" : "Edit task"}
          {recurringParent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <RefreshCw className="size-3" />
              Recurring
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fields marked with <span className="text-destructive">*</span> are required.
        </p>
      </div>

      <FormSection
        icon={ListChecks}
        title="Task"
        tourId="task-form-task"
        description="What needs doing, and whether it's personal or business work."
        className="flex flex-col gap-4"
      >
        <div role="radiogroup" aria-label="Task type" className="grid gap-3 sm:grid-cols-2">
          {TASK_LABEL_OPTIONS.map((option) => (
            <SegmentCard
              key={option.value}
              active={values.label === option.value}
              title={option.label}
              hint={option.desc}
              onSelect={() => set("label", option.value)}
            />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Task name" htmlFor="task-task_name" required error={errors.task_name}>
            <Input
              id="task-task_name"
              placeholder="Task name / description activity"
              value={values.task_name}
              aria-invalid={Boolean(errors.task_name) || undefined}
              className={cn(errors.task_name && "border-destructive")}
              onChange={(e) => set("task_name", e.target.value)}
            />
          </Field>
          <Field label="Status" htmlFor="task-stage_id">
            <Select
              value={values.stage_id || undefined}
              onValueChange={(value) => set("stage_id", value)}
              disabled={stagesQuery.isLoading}
            >
              <SelectTrigger id="task-stage_id">
                <SelectValue placeholder={stagesQuery.isLoading ? "Loading status..." : "Select status"} />
              </SelectTrigger>
              <SelectContent>
                {stages.length === 0 && <SelectEmpty>{stagesQuery.isLoading ? "Loading status..." : "No statuses found"}</SelectEmpty>}
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={String(stage.id)}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Task details" htmlFor="task-task_details">
            <Input
              id="task-task_details"
              placeholder="Task details"
              value={values.task_details}
              onChange={(e) => set("task_details", e.target.value)}
            />
          </Field>
          <Field label="Priority">
            <div role="radiogroup" aria-label="Priority" className="flex h-9 items-center gap-5">
              {PRIORITY_OPTIONS.map((option) => {
                const active = values.priority === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set("priority", option.value)}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="grid size-4 place-items-center rounded-full border border-primary">
                      {active && <span className="size-2 rounded-full bg-primary" />}
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </FormSection>

      <FormSection
        icon={Clock}
        title="Schedule"
        tourId="task-form-schedule"
        description="When the task runs. It shows on the calendar at this time."
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Start date & time" htmlFor="task-start_time" required error={errors.start_time}>
          <DateTimeInput
            id="task-start_time"
            value={values.start_time}
            invalid={Boolean(errors.start_time)}
            onChange={(value) => set("start_time", value)}
          />
        </Field>
        <Field label="End date & time" htmlFor="task-end_time" required error={errors.end_time}>
          <DateTimeInput
            id="task-end_time"
            value={values.end_time}
            invalid={Boolean(errors.end_time)}
            onChange={(value) => set("end_time", value)}
          />
        </Field>
        <Field label="Completed at" htmlFor="task-completed_at" error={errors.completed_at}>
          <DateTimeInput
            id="task-completed_at"
            value={values.completed_at}
            invalid={Boolean(errors.completed_at)}
            onChange={(value) => set("completed_at", value)}
          />
        </Field>

        {creating && (
          <div className="flex flex-col gap-3 sm:col-span-2">
            <SwitchRow
              title="Repeat"
              hint="Turn on to schedule this task on a recurring basis."
              checked={values.repeat}
              onCheckedChange={(checked) => set("repeat", checked)}
            />
            {values.repeat && (
              <div className="flex flex-col gap-4 rounded-md border border-primary/20 bg-primary/[0.03] p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Frequency" htmlFor="task-recurrence_freq">
                    <Select
                      value={values.recurrence_freq}
                      onValueChange={(value) =>
                        set("recurrence_freq", value as TaskFormValues["recurrence_freq"])
                      }
                    >
                      <SelectTrigger id="task-recurrence_freq">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQ_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Every" htmlFor="task-recurrence_interval">
                    <div className="flex items-center gap-2">
                      <Input
                        id="task-recurrence_interval"
                        type="number"
                        min={1}
                        max={99}
                        value={values.recurrence_interval}
                        onChange={(e) => set("recurrence_interval", e.target.value)}
                        className="w-24 tabular-nums"
                      />
                      <span className="text-sm text-muted-foreground">{freqUnit}</span>
                    </div>
                  </Field>
                </div>

                {values.recurrence_freq === "WEEKLY" && (
                  <Field label="Repeat on">
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day) => {
                        const active = values.recurrence_byday.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              set(
                                "recurrence_byday",
                                active
                                  ? values.recurrence_byday.filter((d) => d !== day.value)
                                  : [...values.recurrence_byday, day.value],
                              )
                            }
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input bg-background hover:border-primary/50",
                            )}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                )}

                <Field label="Ends" error={errors.recurrence_until}>
                  <div className="flex flex-col gap-3">
                    <div role="radiogroup" aria-label="Ends" className="flex gap-5">
                      {(
                        [
                          ["count", "After"],
                          ["until", "On date"],
                        ] as const
                      ).map(([value, label]) => {
                        const active = values.recurrence_end_type === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => set("recurrence_end_type", value)}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="grid size-4 place-items-center rounded-full border border-primary">
                              {active && <span className="size-2 rounded-full bg-primary" />}
                            </span>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {values.recurrence_end_type === "count" ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          aria-label="Occurrences"
                          value={values.recurrence_count}
                          onChange={(e) => set("recurrence_count", e.target.value)}
                          className="w-24 tabular-nums"
                        />
                        <span className="text-sm text-muted-foreground">occurrence(s)</span>
                      </div>
                    ) : (
                      <div id="task-recurrence_until" className="space-y-1">
                        <DateTimeInput
                          id="task-recurrence_until-input"
                          value={values.recurrence_until}
                          invalid={Boolean(errors.recurrence_until)}
                          onChange={(value) => set("recurrence_until", value)}
                        />
                        <p className="text-xs text-muted-foreground">Max 30 days from start date.</p>
                      </div>
                    )}
                  </div>
                </Field>
              </div>
            )}
          </div>
        )}

        {recurringParent && (
          <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 sm:col-span-2">
            <RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm">
              This is a <strong>recurring series</strong>. Edits here update the parent event only.
              Individual occurrences can be edited separately.
            </p>
          </div>
        )}
      </FormSection>

      <FormSection
        icon={BriefcaseBusiness}
        title="Links"
        tourId="task-form-links"
        description="Tie the task to a client and job, so the work and the invoice share a record."
        className="grid gap-4 sm:grid-cols-2"
      >
        <div id="task-client" className="sm:col-span-2">
          <Field label="Client" required={billableClientRequired} error={errors.client}>
            <ContactPicker
              value={values.client}
              invalid={Boolean(errors.client)}
              onChange={(contact) => {
                setValues((prev) => ({ ...prev, client: contact, project_id: "", job_id: "" }));
                setErrors((prev) => ({ ...prev, client: undefined, job_id: undefined }));
              }}
            />
          </Field>
        </div>
        <Field label="Project" htmlFor="task-project_id">
          <Select
            value={values.project_id || undefined}
            onValueChange={(value) => {
              setValues((prev) => ({ ...prev, project_id: value, job_id: "" }));
            }}
            disabled={!values.client || projectsQuery.isLoading}
          >
            <SelectTrigger id="task-project_id">
              <SelectValue
                placeholder={
                  !values.client
                    ? "Select client first"
                    : projectsQuery.isLoading
                      ? "Loading projects..."
                      : projects.length === 0
                        ? "No projects for this client"
                        : "Select project"
                }
              />
            </SelectTrigger>
            <SelectContent>
                {projects.length === 0 && <SelectEmpty>{projectsQuery.isLoading ? "Loading projects..." : "No projects for this client"}</SelectEmpty>}
              {projects.map((project) => (
                <SelectItem key={project.id} value={String(project.id)}>
                  {project.project_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Job / Milestone"
          htmlFor="task-job_id"
          required={Boolean(values.project_id)}
          error={errors.job_id}
        >
          <Select
            value={values.job_id || undefined}
            onValueChange={(value) => set("job_id", value)}
            disabled={!values.project_id || jobsQuery.isLoading}
          >
            <SelectTrigger
              id="task-job_id"
              aria-invalid={Boolean(errors.job_id) || undefined}
              className={cn(errors.job_id && "border-destructive")}
            >
              <SelectValue
                placeholder={
                  !values.project_id
                    ? "Select project first"
                    : jobsQuery.isLoading
                      ? "Loading jobs..."
                      : "Select job/milestone"
                }
              />
            </SelectTrigger>
            <SelectContent>
                {jobs.length === 0 && <SelectEmpty>{jobsQuery.isLoading ? "Loading jobs..." : "No jobs for this project"}</SelectEmpty>}
              {jobs.map((job) => (
                <SelectItem key={job.id} value={String(job.id)}>
                  {job.job_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        icon={Paperclip}
        title="Notes & attachments"
        tourId="task-form-notes"
        description="Anything else worth keeping against the task."
        className="flex flex-col gap-4"
      >
        <Field label="Notes" htmlFor="task-notes">
          <Textarea
            id="task-notes"
            placeholder="Add your notes here (optional)"
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            className="resize-none"
          />
        </Field>
        <Field label="Attachments">
          <MultiAttachmentUpload
            noun="file"
            rows={
              creating || recordId === undefined
                ? pendingFiles.map((item) => ({
                    key: item.key,
                    name: item.file.name,
                    size: item.file.size,
                    url: item.previewUrl,
                    status: "idle" as const,
                  }))
                : attachmentRows
            }
            onAdd={(files) => void handleAddFiles(files)}
            onRemove={(key) => void handleRemoveFile(key)}
            onOpen={(row) => window.open(row.url, "_blank", "noopener")}
          />
        </Field>
        <SwitchRow
          title="Billable"
          hint="Mark on if this task's time can be billed to the client."
          checked={values.is_billable}
          onCheckedChange={(checked) => set("is_billable", checked)}
        />
        {values.is_billable && (
          <Field label="Amount" htmlFor="task-fixed_amount" required error={errors.fixed_amount}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {activeCurrencySymbol()}
              </span>
              <Input
                id="task-fixed_amount"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={values.fixed_amount}
                aria-invalid={Boolean(errors.fixed_amount) || undefined}
                onChange={(e) => set("fixed_amount", e.target.value)}
                className={cn("pl-7 tabular-nums", errors.fixed_amount && "border-destructive")}
              />
            </div>
          </Field>
        )}
      </FormSection>

      <div
        className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4"
        data-usertour="task-form-save-actions"
      >
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || attachmentsBusy}>
          {saving && <Loader2 className="animate-spin" />}
          {creating ? "Save task" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
