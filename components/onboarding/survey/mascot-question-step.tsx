"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type ChipOption = { id: string; label: string };

/**
 * One chip question, inside Pip's survey popup.
 *
 * Deliberately not `components/onboarding/first-run/question-step.tsx`: that
 * one holds a selection until a Continue button commits it, which is right
 * for first run's six-screen flow but wrong here — `onboarding-survey-popup`'s
 * whole premise (see its file doc) is that the answer IS the button, so this
 * component fires `onSelect` the instant a chip is tapped. No local
 * "committed vs. pending" state at all.
 *
 * The one answer that can't be a single tap — an "Other"-shaped option that
 * needs free text first — is handled here too, via `otherId`: picking that
 * chip doesn't call `onSelect` immediately, it reveals the text field below
 * the chips (auto-focused, Enter submits). Two survey steps use this: the
 * referral question's "Other", and the industry question's "my industry
 * isn't listed" — see `onboarding-survey-popup.tsx`.
 */
export function MascotQuestionStep({
  options,
  selectedId,
  onSelect,
  search,
  otherId,
  otherValue,
  onOtherChange,
  onOtherSubmit,
  otherPlaceholder = "Tell us more…",
  emptyMessage,
}: {
  options: ChipOption[];
  /** The chip already chosen this step, if any — including `otherId` itself. */
  selectedId: string | null;
  /** Never called for `otherId` — see the file doc above. */
  onSelect: (id: string) => void;
  /** The industry question's search box; absent everywhere else. */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  };
  /** The id whose chip reveals free text instead of answering on tap. */
  otherId?: string;
  otherValue?: string;
  onOtherChange?: (value: string) => void;
  onOtherSubmit?: () => void;
  otherPlaceholder?: string;
  /** Shown in place of the chip grid when `options` is empty (a search with no matches). */
  emptyMessage?: string;
}) {
  const chipClass = (selected: boolean) =>
    cn(
      "rounded-xl border-2 px-3.5 py-2 text-sm font-semibold transition-all",
      selected
        ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
        : "border-border bg-card text-foreground/80 hover:-translate-y-px hover:border-primary hover:text-primary",
    );

  const otherSelected = otherId != null && selectedId === otherId;

  return (
    <div>
      {search && (
        <input
          type="text"
          autoFocus
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
          placeholder={search.placeholder}
          aria-label={search.placeholder}
          className="mb-3 w-full rounded-xl border border-input bg-background p-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}

      <div className="flex max-h-[184px] flex-wrap gap-2 overflow-y-auto pr-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            className={chipClass(selectedId === option.id)}
          >
            {option.label}
          </button>
        ))}
        {options.length === 0 && emptyMessage && (
          <p className="m-0 py-2 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </div>

      {otherSelected && (
        <input
          type="text"
          autoFocus
          maxLength={255}
          className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={otherPlaceholder}
          value={otherValue ?? ""}
          onChange={(event) => onOtherChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onOtherSubmit?.();
            }
          }}
        />
      )}
    </div>
  );
}
