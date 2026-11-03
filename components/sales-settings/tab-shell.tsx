"use client";

import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * One section inside a tab.
 *
 * Was its own card with its own icon tile — the same idea as every other
 * sectioned form, arrived at separately. It's `FormSection` now, so sales
 * settings and the refund, expense and invoice forms share one treatment
 * rather than four that merely resemble each other.
 */
export function SalesSection({
  icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <FormSection icon={icon} title={title} description={description}>
      {children}
    </FormSection>
  );
}

/**
 * Save Changes bottom-right — the same footer on every tab. Save stays disabled until the tab is both dirty and valid, and the
 * outstanding issue is named rather than left to guess at. While a save is in
 * flight both buttons lock and Save shows a spinner, so it reads as working
 * rather than as a click that did nothing.
 */
export function TabFooter({
  dirty,
  issue,
  saving = false,
  onSave,
}: {
  dirty: boolean;
  issue?: string;
  saving?: boolean;
  onSave: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-end gap-3 border-t pt-4"
      data-usertour="sales-settings-save"
    >
      <div className="flex flex-wrap items-center gap-3">
        {issue && <p className="text-xs text-destructive">{issue}</p>}
        {!issue && dirty && !saving && (
          <p className="text-xs text-muted-foreground">Unsaved changes</p>
        )}
        <Button
          onClick={onSave}
          disabled={saving || !dirty || !!issue}
          aria-busy={saving}
        >
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

/** A labelled switch row, the pattern the toggle-heavy tabs are built from. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  children,
  className,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Revealed under the row while the toggle is on. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border", className)}>
      <label className="flex cursor-pointer items-center justify-between gap-4 p-3">
        <span className="min-w-0 space-y-0.5">
          <span className="block text-sm font-medium">{label}</span>
          {hint && (
            <span className="block text-xs text-muted-foreground">{hint}</span>
          )}
        </span>
        <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      </label>
      {/* The field only exists while the row is on, per the reference. */}
      {checked && children && (
        <div className="border-t border-border p-3">{children}</div>
      )}
    </div>
  );
}
