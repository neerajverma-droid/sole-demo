"use client";

import * as React from "react";
import { Check, Loader2, MapPin, SlidersHorizontal, Timer, Video } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AvailabilityEditor } from "@/components/booking-links/availability-editor";
import {
  ChoiceChip,
  Field,
  GoogleMeetCard,
  GoogleMeetMark,
  GradientHeader,
} from "@/components/booking-links/booking-ui";
import { useBookingLinkFormQuery } from "@/hooks/use-booking-links-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  checkSlugAvailability,
  createBookingLink,
  updateBookingLink,
} from "@/lib/booking-links-api";
import {
  DURATION_OPTIONS,
  PRESET_BUFFERS,
  bookingUrlPrefix,
  applyMeetingWhere,
  defaultGoogleCalendarId,
  emptyLinkForm,
  googleCalendars,
  isValidSlug,
  meetingWhere,
  slugify,
  validateLinkForm,
  validateLinkStep,
  type BookingLinkForm,
  type BookingSettings,
  type LinkStep,
  type TimezoneOption,
} from "@/lib/booking-links";
import type { LinkedCalendar } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const STEPS: { step: LinkStep; label: string }[] = [
  { step: 1, label: "Booking info" },
  { step: 2, label: "Meeting setup" },
  { step: 3, label: "Availability" },
];

type SlugState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" | "taken" | "invalid" | "error"; message: string };

function Stepper({
  step,
  onPick,
  canPick,
}: {
  step: LinkStep;
  onPick: (step: LinkStep) => void;
  canPick: (step: LinkStep) => boolean;
}) {
  return (
    <div className="mb-4 flex items-start justify-center">
      {STEPS.map((item, index) => {
        const state = item.step === step ? "on" : item.step < step ? "done" : "todo";
        return (
          <React.Fragment key={item.step}>
            <button
              type="button"
              disabled={!canPick(item.step)}
              onClick={() => onPick(item.step)}
              aria-current={state === "on" ? "step" : undefined}
              className="flex w-[84px] flex-col items-center gap-1 disabled:cursor-default"
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-[11px] font-semibold",
                  state === "on" && "bg-primary text-primary-foreground",
                  state === "done" && "bg-primary/15 text-primary",
                  state === "todo" && "bg-muted text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-3" strokeWidth={3} /> : item.step}
              </span>
              <span
                className={cn(
                  "text-[11px] text-muted-foreground",
                  state === "on" && "font-semibold text-primary",
                )}
              >
                {item.label}
              </span>
            </button>
            {index < STEPS.length - 1 && (
              <div className="mt-3 h-px max-w-[56px] flex-1 bg-border" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function BufferPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [custom, setCustom] = React.useState(() => !PRESET_BUFFERS.includes(value));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESET_BUFFERS.map((minutes) => (
          <ChoiceChip
            key={minutes}
            selected={!custom && value === minutes}
            onClick={() => {
              setCustom(false);
              onChange(minutes);
            }}
          >
            {minutes} min
          </ChoiceChip>
        ))}
        <ChoiceChip selected={custom} onClick={() => setCustom(true)}>
          <Timer />
          Custom
        </ChoiceChip>
      </div>
      {custom && (
        <div className="relative w-32">
          <Input
            type="number"
            min={0}
            max={999}
            inputMode="numeric"
            aria-label="Custom buffer in minutes"
            value={Number.isFinite(value) ? String(value) : ""}
            onChange={(e) => onChange(Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
            className="pr-12"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            min
          </span>
        </div>
      )}
    </div>
  );
}

function calendarName(calendar: LinkedCalendar) {
  const provider =
    calendar.provider === "google" ? "Google Calendar" : calendar.provider || "Calendar";
  return calendar.email ? `${provider} · ${calendar.email}` : provider;
}

/**
 * Create a booking link in three steps — booking info, meeting setup,
 * availability — or edit one, where every step is open at once and the slug
 * is fixed. The old CreateBookingDrawer's fields and rules, in the design's
 * wizard.
 */
export function BookingLinkDialog({
  open,
  onOpenChange,
  linkId,
  settings,
  timezones,
  calendars,
  onSaved,
  onEditSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set to edit that link; `null` creates a new one. */
  linkId: string | number | null;
  settings: BookingSettings | undefined;
  timezones: TimezoneOption[];
  calendars: LinkedCalendar[];
  onSaved: () => void;
  onEditSettings: () => void;
}) {
  const editing = linkId !== null;
  const fallbackTimezone = settings?.timezone || "";
  const detailQuery = useBookingLinkFormQuery(open && editing ? linkId : null, fallbackTimezone);

  const [form, setForm] = React.useState<BookingLinkForm>(() => emptyLinkForm(settings));
  const [step, setStep] = React.useState<LinkStep>(1);
  const [useDefaults, setUseDefaults] = React.useState(true);
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [slug, setSlug] = React.useState<SlugState>({ status: "idle" });
  const [attempted, setAttempted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // Remounts the buffer picker when a whole new form arrives, so its
  // custom/preset mode follows the value.
  const [formVersion, setFormVersion] = React.useState(0);

  // New links start on Google Meet, so the default is the default Google
  // calendar — the one the backend creates the Meet event on.
  const defaultCalendarId = React.useMemo(() => defaultGoogleCalendarId(calendars), [calendars]);

  // A fresh form every time the dialog opens to create.
  React.useEffect(() => {
    if (!open || editing) return;
    setForm({ ...emptyLinkForm(settings), calendar_id: defaultCalendarId });
    setStep(1);
    setUseDefaults(true);
    setSlugTouched(false);
    setSlug({ status: "idle" });
    setAttempted(false);
    setFormVersion((v) => v + 1);
    // Only on open: settings arriving later shouldn't wipe what's been typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  // The link being edited, once it's loaded.
  React.useEffect(() => {
    if (!open || !editing || !detailQuery.data) return;
    setForm({
      ...detailQuery.data,
      calendar_id: detailQuery.data.calendar_id || defaultCalendarId,
    });
    setStep(1);
    setAttempted(false);
    setSlug({ status: "idle" });
    setFormVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, detailQuery.data]);

  React.useEffect(() => {
    if (open && editing && detailQuery.isError) {
      toast.error(apiErrorMessage(detailQuery.error, "Failed to load booking details"));
      onOpenChange(false);
    }
  }, [open, editing, detailQuery.isError, detailQuery.error, onOpenChange]);

  // Settings land after the dialog opened: fill the defaults in, if nobody
  // has changed them yet.
  React.useEffect(() => {
    if (!open || editing || !settings || !useDefaults) return;
    setForm((prev) => ({
      ...prev,
      duration_min: settings.default_duration_min || prev.duration_min,
      buffer_after_minutes: settings.default_buffer_after_minutes,
      timezone: settings.timezone || prev.timezone,
      availability: settings.availability.length ? settings.availability : prev.availability,
    }));
    setFormVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Is the slug free? Checked as it's typed, a moment after typing stops.
  React.useEffect(() => {
    if (!open || editing) return;
    const value = form.slug.trim();
    if (!value) {
      setSlug({ status: "idle" });
      return;
    }
    if (!isValidSlug(value)) {
      setSlug({ status: "invalid", message: "Use only letters, numbers and hyphens." });
      return;
    }
    setSlug({ status: "checking" });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      checkSlugAvailability(value, controller.signal)
        .then((result) =>
          setSlug({ status: result.available ? "available" : "taken", message: result.message }),
        )
        .catch((error) => {
          if (controller.signal.aborted) return;
          setSlug({
            status: "error",
            message: apiErrorMessage(error, "Couldn't check that link."),
          });
        });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.slug, open, editing]);

  const update = (patch: Partial<BookingLinkForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const toggleDefaults = (on: boolean) => {
    setUseDefaults(on);
    if (on && settings) {
      update({
        duration_min: settings.default_duration_min || form.duration_min,
        buffer_after_minutes: settings.default_buffer_after_minutes,
        timezone: settings.timezone || form.timezone,
        availability: settings.availability.length ? settings.availability : form.availability,
      });
      setFormVersion((v) => v + 1);
    }
  };

  const slugOptions = { checkSlug: !editing, slugAvailable: slug.status === "available" };
  const stepError = attempted ? validateLinkStep(form, step, slugOptions) : null;
  const titleMissing = attempted && step === 1 && !form.title.trim();
  const slugMissing = attempted && step === 1 && !form.slug.trim();

  const goNext = () => {
    const error = validateLinkStep(form, step, slugOptions);
    if (error) {
      setAttempted(true);
      if (step === 1 && slug.status === "checking") {
        toast.info("Still checking that booking link — one moment.");
      } else {
        toast.error(error);
      }
      return;
    }
    setAttempted(false);
    setStep((prev) => (prev < 3 ? ((prev + 1) as LinkStep) : prev));
  };

  const submit = async () => {
    const problem = validateLinkForm(form, slugOptions);
    if (problem) {
      setStep(problem.step);
      setAttempted(true);
      toast.error(problem.message);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateBookingLink(linkId, form);
        toast.success("Booking link updated");
      } else {
        await createBookingLink(form);
        toast.success("Booking link created");
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save booking link"));
    } finally {
      setSaving(false);
    }
  };

  const loading = editing && detailQuery.isPending;
  const where = meetingWhere(form);
  // Meeting links are generated, not typed: new links offer Google Meet or in
  // person. A link already saved with its own video URL keeps that option so
  // it can still be edited (or moved to Meet).
  const allowVideoLink =
    editing &&
    detailQuery.data?.meeting_type === "online" &&
    detailQuery.data?.meeting_platform === "other";
  const meetCalendars = googleCalendars(calendars);
  const calendarOptions = where === "google_meet" ? meetCalendars : calendars;
  const timezoneLabel =
    timezones.find((option) => option.value === form.timezone)?.label || form.timezone || "—";

  const slugMessage = editing ? (
    "The booking link can't be changed after it's created."
  ) : slugMissing ? null : slug.status === "checking" ? (
    <span className="inline-flex items-center gap-1">
      <Loader2 className="size-3 animate-spin" /> Checking availability…
    </span>
  ) : slug.status === "available" ? (
    <span className="inline-flex items-center gap-1 text-success">
      <Check className="size-3" /> {slug.message}
    </span>
  ) : (
    "Lowercase letters, numbers and hyphens only."
  );
  const slugError = slugMissing
    ? "A booking link is required"
    : !editing && (slug.status === "taken" || slug.status === "invalid" || slug.status === "error")
      ? slug.message
      : null;

  const body = (
    <>
      {step === 1 && (
        <div>
          {!editing && (
            <div className="mb-5 flex items-center gap-3 rounded-md border border-primary/20 bg-primary/[0.06] px-3.5 py-3">
              <span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <SlidersHorizontal className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">Use default settings</p>
                <p className="text-xs text-muted-foreground">
                  Apply your saved availability &amp; preferences from{" "}
                  <button
                    type="button"
                    onClick={onEditSettings}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Booking settings
                  </button>
                  .
                </p>
              </div>
              <Switch
                className="ml-auto"
                checked={useDefaults}
                onCheckedChange={toggleDefaults}
                aria-label="Use default settings"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Booking title"
              required
              htmlFor="bl-title"
              error={titleMissing ? "A booking title is required" : null}
            >
              <Input
                id="bl-title"
                placeholder="e.g. 30-min strategy call"
                value={form.title}
                aria-invalid={titleMissing}
                className={cn(titleMissing && "border-destructive")}
                onChange={(e) => {
                  const title = e.target.value;
                  update(!editing && !slugTouched ? { title, slug: slugify(title) } : { title });
                }}
              />
            </Field>
            <Field
              label="Booking link"
              required
              htmlFor="bl-slug"
              error={slugError}
              hint={slugMessage}
            >
              <div
                className={cn(
                  "flex h-9 items-stretch overflow-hidden rounded-md border border-input shadow-sm",
                  slugError && "border-destructive",
                  editing && "opacity-60",
                )}
              >
                <span className="flex max-w-[55%] items-center truncate border-r border-border bg-muted/50 px-2.5 text-[13px] text-muted-foreground">
                  {bookingUrlPrefix()}
                </span>
                <input
                  id="bl-slug"
                  placeholder="discovery-call"
                  value={form.slug}
                  disabled={editing}
                  onChange={(e) => {
                    setSlugTouched(true);
                    update({ slug: slugify(e.target.value) });
                  }}
                  className="min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none"
                />
              </div>
            </Field>
            <Field label="Duration" required>
              <Select
                value={String(form.duration_min)}
                onValueChange={(value) => update({ duration_min: Number(value) })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                  {!DURATION_OPTIONS.some((option) => option.value === form.duration_min) && (
                    <SelectItem value={String(form.duration_min)}>
                      {form.duration_min} minutes
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Timezone" hint="Set once for all your links in Booking settings.">
              <Input value={timezoneLabel} disabled readOnly className="bg-muted/40" />
            </Field>
          </div>

          <Field label="Buffer after booking" className="mt-4">
            <BufferPicker
              key={formVersion}
              value={form.buffer_after_minutes}
              onChange={(buffer_after_minutes) => update({ buffer_after_minutes })}
            />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Field label="Where does it happen?">
            <div className="flex flex-wrap gap-2">
              <ChoiceChip
                selected={where === "google_meet"}
                onClick={() => setForm(applyMeetingWhere(form, "google_meet", calendars))}
              >
                <GoogleMeetMark className="size-4" />
                Google Meet
              </ChoiceChip>
              {allowVideoLink && (
                <ChoiceChip
                  selected={where === "video_link"}
                  onClick={() => setForm(applyMeetingWhere(form, "video_link", calendars))}
                >
                  <Video />
                  Other video link
                </ChoiceChip>
              )}
              <ChoiceChip
                selected={where === "in_person"}
                onClick={() => setForm(applyMeetingWhere(form, "in_person", calendars))}
              >
                <MapPin />
                In person
              </ChoiceChip>
            </div>
          </Field>

          {where === "google_meet" && <GoogleMeetCard />}

          {where === "video_link" && (
            <Field
              label="Meeting URL"
              required
              htmlFor="bl-url"
              error={attempted && !form.meeting_url.trim() ? "Please enter a meeting URL" : null}
            >
              <Input
                id="bl-url"
                type="url"
                placeholder="https://zoom.us/j/…"
                value={form.meeting_url}
                onChange={(e) => update({ meeting_url: e.target.value })}
              />
            </Field>
          )}

          {where === "in_person" && (
            <Field
              label="Location"
              required
              htmlFor="bl-location"
              hint="Physical address or meeting point"
              error={attempted && !form.location.trim() ? "Please enter a location" : null}
            >
              <Input
                id="bl-location"
                placeholder="e.g. 123 Main St, Coffee Shop"
                value={form.location}
                onChange={(e) => update({ location: e.target.value })}
              />
            </Field>
          )}

          {where === "google_meet" && meetCalendars.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3">
              <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                Connect a Google Calendar so Sole can generate the Meet link for each booking.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/calendar">Connect Google Calendar</Link>
              </Button>
              {attempted && (
                <p className="w-full text-xs text-destructive">
                  A Google calendar is required to generate Google Meet links
                </p>
              )}
            </div>
          ) : (
            <Field
              label={where === "google_meet" ? "Google calendar" : "Calendar"}
              required={where === "google_meet"}
              hint={
                where === "google_meet"
                  ? "The Meet link is created on this calendar when a guest books."
                  : calendarOptions.length === 0
                    ? "No calendar connected yet — connect one from the Calendar screen."
                    : "Bookings are added to this calendar."
              }
              error={
                attempted && where === "google_meet" && !form.calendar_id
                  ? "A calendar is required to generate Google Meet links"
                  : null
              }
            >
              <Select
                value={form.calendar_id || undefined}
                onValueChange={(calendar_id) => update({ calendar_id })}
                disabled={calendarOptions.length === 0}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select a calendar" />
                </SelectTrigger>
                <SelectContent>
                  {calendarOptions.map((calendar) => (
                    <SelectItem key={calendar.id} value={String(calendar.id)}>
                      {calendarName(calendar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Description" htmlFor="bl-desc">
            <Textarea
              id="bl-desc"
              rows={3}
              placeholder="What should guests know before booking?"
              value={form.intro_text}
              onChange={(e) => update({ intro_text: e.target.value })}
            />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div>
          <p className="mb-4 text-[13px] text-muted-foreground">
            {useDefaults && !editing ? "Using your saved availability from Settings — " : ""}
            guests can book on the days and hours you set here. The slots also need to be free in
            your calendar.
          </p>
          <AvailabilityEditor
            key={formVersion}
            value={form.availability}
            onChange={(availability) => update({ availability })}
          />
        </div>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent
        hideClose
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-6 sm:max-w-[720px]"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header and steps stay put; only the form between them scrolls. */}
        <div className="shrink-0">
          <GradientHeader
            title={editing ? "Edit booking link" : "New booking link"}
            description="Set up a link clients can use to book time with you."
          />
          <Stepper
            step={step}
            onPick={setStep}
            canPick={(target) => target !== step && (editing || target < step)}
          />
        </div>

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 py-1">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-md bg-muted/60" />
              ))}
            </div>
          ) : (
            body
          )}

          {stepError && step !== 1 && !loading && (
            <p className="mt-3 text-xs text-destructive">{stepError}</p>
          )}
        </div>

        <div className="-mx-6 mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-6 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep((prev) => (prev - 1) as LinkStep)}
                disabled={saving}
              >
                Back
              </Button>
            )}
            {editing && step < 3 && (
              <Button variant="outline" onClick={goNext} disabled={saving || loading}>
                Next
              </Button>
            )}
            {editing || step === 3 ? (
              <Button onClick={() => void submit()} disabled={saving || loading}>
                {saving && <Loader2 className="animate-spin" />}
                {editing ? "Save changes" : "Create link"}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={saving}>
                Continue
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
