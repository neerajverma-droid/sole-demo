"use client";

import * as React from "react";

import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** The design's gradient band across the top of the booking dialogs. */
export function GradientHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="-mx-6 -mt-6 mb-4 rounded-t-lg bg-gradient-to-br from-primary to-[hsl(258_90%_66%)] px-6 py-3 text-white">
      <DialogTitle className="text-base font-semibold text-white">{title}</DialogTitle>
      {description ? (
        <DialogDescription className="mt-0.5 text-xs leading-normal text-white/85">
          {description}
        </DialogDescription>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  required,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  error?: string | null;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** A section title, its one-line explanation and a hairline under both. */
export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    // The rule runs the dialog's full width; the text keeps its padding.
    <div className="-mx-6 mb-4 mt-6 border-b border-border px-6 pb-3 first:mt-0">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
    </div>
  );
}

/** A pill that's one of a set — buffers, where a meeting happens. */
export function ChoiceChip({
  selected,
  onClick,
  disabled,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors disabled:opacity-50 [&_svg]:size-4",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/** The design's two- or three-way segmented toggle. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-lg border border-input"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "border-l border-border px-3 py-1.5 text-[13px] transition-colors first:border-l-0 hover:bg-accent/60",
            value === option.value && "bg-accent font-semibold",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** An icon tile, a small label and its value — the details dialog's rows. */
export function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-border py-2 first:border-t-0">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="break-words text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: "upcoming" | "past" | "pending" }) {
  const styles = {
    upcoming: "border-primary/20 bg-primary/10 text-primary",
    past: "border-transparent bg-secondary text-secondary-foreground",
    pending: "border-warning/20 bg-warning/10 text-warning",
  } as const;
  const labels = { upcoming: "Upcoming", past: "Past", pending: "Pending" } as const;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        styles[status],
      )}
    >
      {labels[status]}
    </span>
  );
}

/** Google Meet's mark — the same one the old booking drawer showed. */
export function GoogleMeetMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn("size-5", className)}>
      <rect width="16" height="16" x="12" y="16" fill="#fff" transform="rotate(-90 20 24)" />
      <polygon fill="#1e88e5" points="3,17 3,31 8,32 13,31 13,17 8,16" />
      <path fill="#4caf50" d="M37,24v14c0,1.657-1.343,3-3,3H13l-1-5l1-5h14v-7l5-1L37,24z" />
      <path fill="#fbc02d" d="M37,10v14H27v-7H13l-1-5l1-5h21C35.657,7,37,8.343,37,10z" />
      <path fill="#1565c0" d="M13,31v10H6c-1.657,0-3-1.343-3-3v-7H13z" />
      <polygon fill="#e53935" points="13,7 13,17 3,17" />
      <polygon fill="#2e7d32" points="38,24 37,32.45 27,24 37,15.55" />
      <path
        fill="#4caf50"
        d="M46,10.11v27.78c0,0.84-0.98,1.31-1.63,0.78L37,32.45v-16.9l7.37-6.22C45.02,8.8,46,9.27,46,10.11z"
      />
    </svg>
  );
}

/**
 * "Google Meet — a link will be generated automatically": the old drawer's
 * card. Nothing is entered here; the backend makes the Meet link on the
 * host's Google calendar the moment a guest books.
 */
export function GoogleMeetCard() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center">
        <GoogleMeetMark className="size-[30px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Google Meet</p>
        <p className="text-xs text-muted-foreground">
          A link will be generated automatically for every booking.
        </p>
      </div>
      <span className="shrink-0 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
        Auto
      </span>
    </div>
  );
}
