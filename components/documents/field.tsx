import * as React from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";

/** Marks a required field, matching the platform's red asterisk. */
export function Required() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden>
      *
    </span>
  );
}

/**
 * Labelled field with the shared error / hint slot. Used by both the invoice
 * and quote editors so their forms read identically.
 */
export function Field({
  label,
  htmlFor,
  required,
  labelTip,
  hint,
  error,
  children,
}: {
  label: string;
  /**
   * The id of the control this labels. Worth passing wherever the control is a
   * plain input: it makes the label clickable and ties the two together for a
   * screen reader.
   */
  htmlFor?: string;
  required?: boolean;
  /**
   * An explanation beside the label rather than under the control.
   *
   * For a field whose *options* need explaining — where a hint would have to
   * repeat itself once per choice, and only the selected one would be visible.
   */
  labelTip?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5" htmlFor={htmlFor}>
        {label}
        {required && <Required />}
        {labelTip && <InfoTip text={labelTip} />}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
