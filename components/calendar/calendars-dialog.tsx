"use client";

import * as React from "react";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { GoogleMark } from "@/components/calendar/event-chip";
import type { LinkedCalendar } from "@/lib/calendar";
import { cn } from "@/lib/utils";

/** The design's gradient header band, shared by the calendar dialogs. */
function GradientHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="-mx-6 -mt-6 mb-5 rounded-t-lg bg-gradient-to-br from-primary to-[hsl(258_90%_66%)] px-6 py-4 text-white">
      <DialogTitle className="text-lg font-semibold text-white">{title}</DialogTitle>
      {description ? (
        <DialogDescription className="mt-1 text-[13px] leading-normal text-white/85">
          {description}
        </DialogDescription>
      ) : null}
    </div>
  );
}

function ProviderMark({ provider }: { provider?: string }) {
  const normalized = provider?.toLowerCase?.() || "";
  if (normalized === "google") return <GoogleMark className="size-5" />;
  if (!normalized) return <CalendarDays className="size-5 text-muted-foreground" />;
  return (
    <span className="text-xs font-semibold uppercase text-muted-foreground">
      {normalized.slice(0, 2)}
    </span>
  );
}

/**
 * A linked calendar's colour — the same `border_color` its events are
 * outlined in, so a calendar here can be matched to its events on the grid.
 */
export function calendarAccent(calendar: LinkedCalendar): string | null {
  return calendar.border_color || calendar.color || null;
}

/**
 * "Calendars" — every linked calendar, which one is the default, and the way
 * in to connecting another. The old screen's "Your Calendars" dialog and its
 * "Add Calendar" button, folded into the one place the design puts them.
 */
export function CalendarsDialog({
  open,
  onOpenChange,
  calendars,
  isLoading,
  pendingDefaultId,
  pendingDeleteId,
  isAddingCalendar,
  onSelectDefault,
  onDeleteCalendar,
  onAddCalendar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendars: LinkedCalendar[];
  isLoading: boolean;
  pendingDefaultId: string | number | null;
  pendingDeleteId: string | number | null;
  isAddingCalendar: boolean;
  onSelectDefault: (calendar: LinkedCalendar) => void;
  onDeleteCalendar: (calendar: LinkedCalendar) => void;
  onAddCalendar: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-h-[90vh] gap-0 overflow-y-auto p-6 sm:max-w-[560px]">
        <GradientHeader
          title="Calendars"
          description="View linked calendars and choose which one should be your default."
        />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg border border-border bg-muted/40" />
            ))}
          </div>
        ) : calendars.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-5 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <p className="font-semibold">No calendar linked yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect a calendar to sync events and use it inside your planner.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="pb-2 text-sm text-muted-foreground">
              {calendars.length} linked calendar{calendars.length > 1 ? "s" : ""}. The default is
              where new tasks are synced.
            </p>
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {calendars.map((calendar) => {
                const isDefault = Boolean(calendar.is_default);
                const isPending = pendingDefaultId === calendar.id;
                const isDeleting = pendingDeleteId === calendar.id;
                const accent = calendarAccent(calendar);
                return (
                  <div
                    key={calendar.id}
                    className={cn(
                      // One 1px border — a ring on top of it drew thicker and
                      // uneven at the corners.
                      "relative flex flex-col gap-3 overflow-hidden rounded-lg border p-3 pl-4 transition-colors sm:flex-row sm:items-center",
                      isDefault ? "border-primary bg-primary/[0.03]" : "border-border",
                    )}
                  >
                    {/* Its events' colour, as a stripe down the edge, so this
                        calendar can be matched to its events on the grid. */}
                    {accent && (
                      <span
                        aria-hidden
                        title="Events from this calendar show in this colour"
                        className="absolute inset-y-2 left-1.5 w-1 rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                    )}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-background">
                        <ProviderMark provider={calendar.provider} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {calendar.calendar_id || "primary"}
                        </p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <Mail className="size-3.5 shrink-0" />
                          {calendar.email || "No email available"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {isDefault ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          <CheckCircle2 className="size-3.5" />
                          Default calendar
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending || isDeleting}
                          onClick={() => onSelectDefault(calendar)}
                        >
                          {isPending ? <Loader2 className="animate-spin" /> : <Check />}
                          {isPending ? "Updating..." : "Make default"}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        aria-label="Remove calendar"
                        disabled={isDeleting || isPending}
                        onClick={() => onDeleteCalendar(calendar)}
                      >
                        {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onAddCalendar}
          disabled={isAddingCalendar}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
        >
          {isAddingCalendar ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
          {isAddingCalendar ? "Connecting..." : "Connect a calendar"}
        </button>

        <div className="mt-5 flex justify-end border-t border-border pt-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Shown on the way back from Google — `?google_cal_status=success|failed`. */
export function CalendarConnectResultDialog({
  status,
  email,
  errorMessage,
  onClose,
  onTryAgain,
}: {
  status: "success" | "failed" | null;
  email: string;
  errorMessage: string;
  onClose: () => void;
  onTryAgain: () => void;
}) {
  const success = status === "success";
  return (
    <Dialog open={status !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideClose className="max-w-md p-8 text-center">
        <span
          className={cn(
            "mx-auto grid size-14 place-items-center rounded-full",
            success ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          {success ? <Check className="size-7" strokeWidth={2.8} /> : <X className="size-7" strokeWidth={2.8} />}
        </span>
        <div className="space-y-2">
          <DialogTitle className="text-lg font-semibold">
            {success ? "Calendar added!" : "Calendar not added"}
          </DialogTitle>
          <DialogDescription>
            {success
              ? "Your calendar has been connected successfully. It can take a little time for all events to be fetched and appear in your calendar."
              : errorMessage || "We could not connect your calendar. Please try again."}
          </DialogDescription>
        </div>

        {success ? (
          <>
            {email ? (
              <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-left">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                  <CalendarDays className="size-4" />
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-primary">{email}</p>
                <span className="size-2.5 shrink-0 rounded-full bg-success ring-4 ring-success/20" />
              </div>
            ) : null}
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-left">
              <p className="text-sm font-semibold text-warning">Sync in progress</p>
              <p className="mt-1 text-xs text-muted-foreground">
                If you do not see all events immediately, please refresh the calendar after some time.
              </p>
            </div>
            <div className="flex justify-center">
              <Button onClick={onClose}>Go to Calendar</Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-left">
              <p className="text-sm font-semibold text-destructive">Connection failed</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Review the error above, then retry the Google Calendar connection.
              </p>
            </div>
            <div className="flex justify-center">
              <Button variant="destructive" onClick={onTryAgain}>
                Try again
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
