"use client";

import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BILL_REPEAT_ENDS,
  BILL_REPEAT_OPTIONS,
  type BillRepeatEnd,
  type BillRepeatFrequency,
} from "@/lib/bills";

export type RepeatFieldsValue = {
  frequency: BillRepeatFrequency;
  nextDate: string;
  endType: BillRepeatEnd;
  endDate: string;
  totalCount: string;
};

/**
 * How often, when next, and when it stops — the same fields for a new bill's
 * repeat and for the Manage repeat panel. `countHint` says what the count
 * includes, which differs: a new bill counts itself as the first.
 */
export function BillRepeatFields({
  idPrefix,
  value,
  onChange,
  errorFor,
  nextDateLabel = "Next bill date",
  countHint,
}: {
  idPrefix: string;
  value: RepeatFieldsValue;
  onChange: (patch: Partial<RepeatFieldsValue>) => void;
  errorFor: (key: string) => string | undefined;
  nextDateLabel?: string;
  countHint?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Repeats" htmlFor={`${idPrefix}-frequency`}>
        <Select value={value.frequency} onValueChange={(next) => onChange({ frequency: next as BillRepeatFrequency })}>
          <SelectTrigger id={`${idPrefix}-frequency`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BILL_REPEAT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={nextDateLabel} required error={errorFor("repeatNextDate")}>
        <DatePicker
          label={nextDateLabel}
          value={value.nextDate}
          onChange={(iso) => onChange({ nextDate: iso })}
          invalid={!!errorFor("repeatNextDate")}
        />
      </Field>
      <Field label="Ends" htmlFor={`${idPrefix}-end`}>
        <Select value={value.endType} onValueChange={(next) => onChange({ endType: next as BillRepeatEnd })}>
          <SelectTrigger id={`${idPrefix}-end`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BILL_REPEAT_ENDS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {value.endType === "on_date" && (
        <Field label="Last bill on or before" required error={errorFor("repeatEndDate")}>
          <DatePicker
            label="End date"
            value={value.endDate}
            onChange={(iso) => onChange({ endDate: iso })}
            invalid={!!errorFor("repeatEndDate")}
          />
        </Field>
      )}
      {value.endType === "after_count" && (
        <Field
          label="Number of bills"
          htmlFor={`${idPrefix}-count`}
          required
          hint={countHint}
          error={errorFor("repeatTotalCount")}
        >
          <Input
            id={`${idPrefix}-count`}
            inputMode="numeric"
            value={value.totalCount}
            onChange={(event) => onChange({ totalCount: event.target.value.replace(/[^\d]/g, "") })}
            placeholder="12"
            aria-invalid={!!errorFor("repeatTotalCount")}
          />
        </Field>
      )}
    </div>
  );
}
