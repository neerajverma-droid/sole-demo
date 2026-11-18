"use client";

import { DatePicker } from "@/components/documents/date-picker";
import { Label } from "@/components/ui/label";
import { isValid, parseISO } from "date-fns";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PreviewToggle } from "@/components/layout/preview-toggle";
import { PreviewToggleRow } from "@/components/layout/page-header";
import type { PreviewState } from "@/components/layout/preview-toggle";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { parseIsoDate, toIsoDate } from "@/lib/invoices";
import {
  fyLabel,
  periodShape,
  pickedNamedRange,
  type NamedRange,
  type ReportPeriod,
  type ReportRange,
} from "@/lib/report-periods";

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
  financialYears,
  namedRanges,
  namedKey,
  onNamedChange,
}: {
  periods: readonly ReportPeriod[];
  value: ReportPeriod;
  onChange: (next: ReportPeriod) => void;
  range: ReportRange | null;
  onRangeChange: (next: ReportRange) => void;
  /**
   * The business's own financial years, for a report that can be run for one
   * further back than the presets reach. Listed in this same control, under
   * the presets, so a report never has two places to pick a year from.
   */
  financialYears?: readonly ReportRange[];
  /** Spans listed above the presets; omitted, the list is exactly as before. */
  namedRanges?: readonly NamedRange[];
  /**
   * Which named range is picked, kept by the screen. With it, only an explicit
   * pick shows a named range as chosen; without it, a range equal to one's
   * dates does.
   */
  namedKey?: string | null;
  onNamedChange?: (key: string | null) => void;
}) {
  const fiscalYearStart = useFiscalYearStart();

  const choose = (next: ReportPeriod) => {
    // A preset or "Custom range" is never a named range, whatever the dates.
    onNamedChange?.(null);
    onChange(next);
    if (next === "Custom range" && !range) {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      onRangeChange({ from: toIsoDate(start), to: toIsoDate(today) });
    }
  };

  // A year is a custom range of exactly its own dates, so one picked here
  // shows as picked for as long as that range is left alone.
  const pickedYear =
    value === "Custom range" && range
      ? financialYears?.find((year) => year.from === range.from && year.to === range.to)
      : undefined;
  const yearName = (year: ReportRange) =>
    `FY ${fyLabel(parseISO(year.from), fiscalYearStart)}`;
  const pickedNamed = pickedNamedRange(value, range, namedRanges, namedKey, Boolean(onNamedChange));

  return (
    <Select
      value={
        pickedNamed
          ? `${NAMED_PREFIX}${pickedNamed.key}`
          : pickedYear
            ? `${YEAR_PREFIX}${pickedYear.from}`
            : value
      }
      onValueChange={(next) => {
        if (next.startsWith(NAMED_PREFIX)) {
          const named = namedRanges?.find((n) => `${NAMED_PREFIX}${n.key}` === next);
          if (!named) return;
          onNamedChange?.(named.key);
          onChange("Custom range");
          onRangeChange({ ...named.range });
          return;
        }
        if (next.startsWith(YEAR_PREFIX)) {
          const year = financialYears?.find((y) => `${YEAR_PREFIX}${y.from}` === next);
          if (!year) return;
          onNamedChange?.(null);
          onChange("Custom range");
          onRangeChange({ from: year.from, to: year.to });
          return;
        }
        choose(next as ReportPeriod);
      }}
    >
      <SelectTrigger
        // Sized by the chosen period's name, so the space either side of it is
        // the same 12px: px-3 on the left, and on the right gap-2 / pr-2 plus
        // the ~4px of whitespace inside the chevron's own 16px box. No min
        // width — any width beyond the text's lands as a wider gap after it.
        className="w-auto gap-2 pr-2"
        aria-label="Reporting period"
        data-usertour="report-period"
      >
        {/* Just the name: the trigger is too narrow for the dates as well. */}
        <SelectValue>{pickedNamed ? pickedNamed.name : pickedYear ? yearName(pickedYear) : value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {namedRanges?.map((named) => (
          <SelectItem key={named.key} value={`${NAMED_PREFIX}${named.key}`}>
            <span className="flex w-full items-baseline gap-3">
              <span>{named.name}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular">{named.scope}</span>
            </span>
          </SelectItem>
        ))}
        {periods.map((option) => (
          <SelectItem key={option} value={option}>
            <PeriodOption period={option} />
          </SelectItem>
        ))}
        <EarlierYears
          financialYears={financialYears}
          periods={periods}
          name={yearName}
        />
      </SelectContent>
    </Select>
  );
}

const YEAR_PREFIX = "fy:";
const NAMED_PREFIX = "nr:";

/**
 * The financial years the presets don't already cover — older than "Last
 * financial year" when that's offered, older than this one when only "This
 * financial year" is. Never this year or last a second time, under another name.
 *
 * Only rendered while the list is open, so today's date can't disagree with a
 * server render.
 */
function EarlierYears({
  financialYears,
  periods,
  name,
}: {
  financialYears?: readonly ReportRange[];
  periods: readonly ReportPeriod[];
  name: (year: ReportRange) => string;
}) {
  const fiscalYearStart = useFiscalYearStart();
  if (!financialYears?.length) return null;

  const newestPreset = periods.includes("Last financial year")
    ? "Last financial year"
    : periods.includes("This financial year")
      ? "This financial year"
      : null;
  const before = newestPreset
    ? toIsoDate(periodShape(newestPreset, null, undefined, fiscalYearStart).current.from)
    : null;
  const earlier = financialYears
    // A year whose dates don't parse can't be named or run, so it isn't offered.
    .filter((year) => isValid(parseISO(year.from)) && isValid(parseISO(year.to)))
    .filter((year) => !before || year.from < before)
    .sort((a, b) => b.from.localeCompare(a.from));
  if (earlier.length === 0) return null;

  return (
    <>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel className="text-xs font-normal text-muted-foreground">
          Earlier financial years
        </SelectLabel>
        {earlier.map((year) => (
          <SelectItem key={year.from} value={`${YEAR_PREFIX}${year.from}`}>
            {name(year)}
          </SelectItem>
        ))}
      </SelectGroup>
    </>
  );
}

/**
 * "Last quarter  Q1 FY27" — a preset with the span it stands for, so "this"
 * and "last" are never a guess about which quarter or year is meant.
 *
 * Only rendered while the list is open, which is always in the browser, so
 * reading today's date here can't disagree with a server render.
 */
function PeriodOption({ period }: { period: ReportPeriod }) {
  const fiscalYearStart = useFiscalYearStart();
  const scope =
    period === "Custom range"
      ? null
      : periodShape(period, null, undefined, fiscalYearStart).scope;

  return (
    <span className="flex w-full items-baseline gap-3">
      <span>{period}</span>
      {scope && (
        <span className="ml-auto text-xs text-muted-foreground tabular">{scope}</span>
      )}
    </span>
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
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: ReportRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-md border border-dashed border-border bg-card px-4 py-3">
      <div className="space-y-1.5">
        {/* Block, so it sits above its picker: as an inline label it shared the
            picker's line and touched it. */}
        <Label htmlFor="report-range-from" className="block text-xs">
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
        <Label htmlFor="report-range-to" className="block text-xs">
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
      {/* No restatement of the range here: the two pickers already show it. */}
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
