"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function StepHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Save-and-continue, named for the step it leads to. */
export function StepFooter({
  saving,
  disabled,
  nextLabel,
  onSave,
  backLabel,
  onBack,
}: {
  saving: boolean;
  disabled?: boolean;
  nextLabel: string;
  onSave: () => void;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      {onBack && backLabel && (
        <Button type="button" variant="outline" disabled={saving} onClick={onBack}>
          <ChevronLeft />
          {backLabel}
        </Button>
      )}
      <Button type="button" disabled={saving || disabled} onClick={onSave}>
        {saving && <Loader2 className="animate-spin" aria-hidden />}
        {saving ? "Saving..." : nextLabel}
        {!saving && nextLabel !== "Save" && <ChevronRight />}
      </Button>
    </div>
  );
}

/** A switch on a tinted card, with its explanation beside it. */
export function ToggleCard({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor={id}>{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {children}
    </div>
  );
}

/** Touched-field tracking: errors show per field, or all at once on save. */
export function useTouched() {
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = React.useState(false);
  return {
    show: (key: string) => submitted || Boolean(touched[key]),
    touch: (key: string) => setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true })),
    submit: () => setSubmitted(true),
  };
}
