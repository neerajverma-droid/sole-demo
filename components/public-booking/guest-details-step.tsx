"use client";

import * as React from "react";
import { ArrowLeft, CalendarDays, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ThemedButton, type HostTheme } from "@/components/public-booking/booking-shell";
import {
  addGuest,
  isValidEmail,
  slotWhen,
  validateGuestDetails,
  type GuestDetails,
  type PublicSlot,
} from "@/lib/public-booking";

/**
 * Step two: who's coming. Name and email are required; notes and extra
 * guests aren't. When rescheduling, the booking's own details are filled in.
 */
export function GuestDetailsStep({
  slot,
  timezone,
  durationLabel,
  initial,
  submitting,
  rescheduling,
  theme,
  onBack,
  onSubmit,
}: {
  slot: PublicSlot;
  timezone: string;
  durationLabel: string;
  initial: GuestDetails | null;
  submitting: boolean;
  rescheduling: boolean;
  theme: HostTheme;
  onBack: () => void;
  onSubmit: (details: GuestDetails) => void;
}) {
  const [details, setDetails] = React.useState<GuestDetails>(
    () => initial ?? { name: "", email: "", message: "", guests: [] },
  );
  const [guestDraft, setGuestDraft] = React.useState("");
  const [attempted, setAttempted] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initial) setDetails(initial);
  }, [initial]);

  const when = slotWhen(slot);
  const set = (patch: Partial<GuestDetails>) => setDetails((prev) => ({ ...prev, ...patch }));

  const commitGuest = () => {
    const value = guestDraft.trim();
    if (!value) return true;
    if (!isValidEmail(value)) {
      setProblem(`${value} isn't a valid email.`);
      return false;
    }
    set({ guests: addGuest(details.guests, value) });
    setGuestDraft("");
    setProblem(null);
    return true;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!commitGuest()) return;
    const pending = guestDraft.trim() ? addGuest(details.guests, guestDraft) : details.guests;
    const next = { ...details, guests: pending };
    const error = validateGuestDetails(next);
    setProblem(error);
    if (!error) onSubmit(next);
  };

  const nameMissing = attempted && !details.name.trim();
  const emailBad = attempted && !isValidEmail(details.email);

  return (
    <form onSubmit={submit} noValidate>
      <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-3" onClick={onBack}>
        <ArrowLeft />
        Back
      </Button>

      <div
        className="mb-6 flex items-start gap-3 rounded-lg border p-3"
        style={{ borderColor: `${theme.color}33`, backgroundColor: `${theme.color}0D` }}
      >
        <span
          className="grid size-9 shrink-0 place-items-center rounded-md"
          style={{ backgroundColor: theme.color, color: theme.text }}
        >
          <CalendarDays className="size-4" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">{when.date}</p>
          <p className="text-muted-foreground">
            {when.time} · {durationLabel} · {timezone.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      <h2 className="text-lg font-semibold">Your details</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="guest-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="guest-name"
            autoComplete="name"
            placeholder="Jane Smith"
            value={details.name}
            aria-invalid={nameMissing}
            className={nameMissing ? "border-destructive" : undefined}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guest-email">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="guest-email"
            type="email"
            autoComplete="email"
            placeholder="jane@example.com"
            value={details.email}
            aria-invalid={emailBad}
            className={emailBad ? "border-destructive" : undefined}
            onChange={(e) => set({ email: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label htmlFor="guest-extra">Add guests</Label>
        <div className="flex gap-2">
          <Input
            id="guest-extra"
            type="email"
            placeholder="colleague@example.com"
            value={guestDraft}
            onChange={(e) => setGuestDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitGuest();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={commitGuest}>
            <Plus />
            Add
          </Button>
        </div>
        {details.guests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {details.guests.map((guest) => (
              <span
                key={guest}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs"
              >
                {guest}
                <button
                  type="button"
                  aria-label={`Remove ${guest}`}
                  onClick={() => set({ guests: details.guests.filter((item) => item !== guest) })}
                  className="grid size-4 place-items-center rounded-full hover:bg-muted"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">They&apos;ll get the calendar invite too.</p>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label htmlFor="guest-notes">Notes</Label>
        <Textarea
          id="guest-notes"
          rows={3}
          placeholder="Anything that will help prepare for the meeting…"
          value={details.message}
          onChange={(e) => set({ message: e.target.value })}
        />
      </div>

      {problem && <p className="mt-3 text-sm text-destructive">{problem}</p>}

      <div className="mt-6 flex justify-end">
        <ThemedButton theme={theme} type="submit" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          {rescheduling ? "Confirm new time" : "Schedule meeting"}
        </ThemedButton>
      </div>
    </form>
  );
}
