"use client";

import { DatePicker } from "@/components/documents/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PreviewToggle } from "@/components/layout/preview-toggle";
import { PreviewToggleRow } from "@/components/layout/page-header";
import type { PreviewState } from "@/components/layout/preview-toggle";
import { parseIsoDate, toIsoDate } from "@/lib/invoices";
import type { ReportPeriod, ReportRange } from "@/lib/report-periods";

/**
 * The controls every Reporting suite report shares.
 *
 * Extracted from the Profit & Loss screen when the Transaction Listing wanted
 * the same period selector over a different set of presets — so the presets are
 * a prop and everything about how the control behaves is here, once.
 */

/**
 * The period selector: one control, and the report's own list of presets.
 *
 * Choosing "Custom range" seeds the dates rather than dropping the reader into
 * two empty fields — done in the handler because `new Date()` during a render is
 * a different moment on the server than in the browser, which hydrates as a
 * mismatch. Only seeds once: a range someone has set survives switching to a
 * preset and back.
 */
export function ReportPeriodSelect({
  periods,
  value,
  onChange,
  range,
  onRangeChange,
}: {
  periods: readonly ReportPeriod[];
  value: ReportPeriod;
  onChange: (next: ReportPeriod) => void;
  range: ReportRange | null;
  onRangeChange: (next: ReportRange) => void;
}) {
  const choose = (next: ReportPeriod) => {
    onChange(next);
    if (next === "Custom range" && !range) {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      onRangeChange({ from: toIsoDate(start), to: toIsoDate(today) });
    }
  };

  return (
    <Select
      value={value}
      onValueChange={(next) => choose(next as ReportPeriod)}
    >
      <SelectTrigger className="w-[13.5rem]" aria-label="Reporting period">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periods.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The two dates behind "Custom range".
 *
 * Under the header rather than inside the select: the period stays a single
 * control, and the dates appear as a consequence of the one choice that needs
 * them instead of sitting there empty for the presets that don't.
 */
export function ReportCustomRange({
  from,
  to,
  label,
  onChange,
}: {
  from: string;
  to: string;
  label: string;
  onChange: (next: ReportRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-md border border-dashed border-border bg-card px-4 py-3">
      <div className="space-y-1.5">
        <Label htmlFor="report-range-from" className="text-xs">
          From
        </Label>
        <DatePicker
          id="report-range-from"
          label="From"
          value={from}
          // The end can't precede the start, so the pickers bound each other
          // rather than letting an impossible range be entered and then rejected.
          toDate={parseIsoDate(to)}
          onChange={(iso) => onChange({ from: iso, to })}
          className="h-9 w-[10.5rem]"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="report-range-to" className="text-xs">
          To
        </Label>
        <DatePicker
          id="report-range-to"
          label="To"
          value={to}
          fromDate={parseIsoDate(from)}
          onChange={(iso) => onChange({ from, to: iso })}
          className="h-9 w-[10.5rem]"
        />
      </div>
      <p className="pb-2 text-xs text-muted-foreground tabular">{label}</p>
    </div>
  );
}

/**
 * Demo control: flips a report between a first-run account and the full thing.
 *
 * The row and the toggle are the shared ones every list screen uses, so a report
 * gets the same control in the same place. What's different is the gate — a
 * report with no data behind it yet is a state the team hasn't signed off, so
 * this never renders in a production build, and each report's preview atom
 * defaults to "data" because that default is the only state anyone will see.
 */
export function ReportPreviewToggle({
  value,
  onChange,
  note,
}: {
  value: PreviewState;
  onChange: (next: PreviewState) => void;
  /** What the empty state demonstrates, in a phrase. */
  note: string;
}) {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <PreviewToggleRow>
      <PreviewToggle
        value={value}
        onChange={onChange}
        emptyLabel="No data"
        dataLabel="With data"
      />
      <span className="text-xs text-muted-foreground">— {note} Dev only.</span>
    </PreviewToggleRow>
  );
}
