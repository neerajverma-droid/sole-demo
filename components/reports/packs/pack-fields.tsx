"use client";

import * as React from "react";

import { DatePicker } from "@/components/documents/date-picker";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CUSTOM_PERIOD,
  STARTER_SOURCE,
  TEMPLATE_SOURCE,
  type StarterTemplate,
  type TemplateSource,
} from "@/lib/report-packs";
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/report-periods";

export function TemplateSourceSelect({
  id,
  value,
  onChange,
  templates,
  starters,
  placeholder,
  disabled,
}: {
  id: string;
  value: TemplateSource | "";
  onChange: (next: TemplateSource) => void;
  templates: { id: number; name: string }[];
  starters: StarterTemplate[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as TemplateSource)}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {templates.length > 0 && (
          <SelectGroup>
            <SelectLabel>Your templates</SelectLabel>
            {templates.map((template) => (
              <SelectItem
                key={template.id}
                value={`${TEMPLATE_SOURCE}${template.id}`}
              >
                {template.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {starters.length > 0 && (
          <SelectGroup>
            <SelectLabel>Ready-made</SelectLabel>
            {starters.map((starter) => (
              <SelectItem
                key={starter.key}
                value={`${STARTER_SOURCE}${starter.key}`}
              >
                {starter.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

export function PeriodFields({
  idPrefix,
  period,
  onPeriodChange,
  from,
  to,
  onFromChange,
  onToChange,
  disabled,
}: {
  idPrefix: string;
  period: ReportPeriod;
  onPeriodChange: (next: ReportPeriod) => void;
  from: string;
  to: string;
  onFromChange: (next: string) => void;
  onToChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-period`}>Period</Label>
        <Select
          value={period}
          onValueChange={(next) => onPeriodChange(next as ReportPeriod)}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-period`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_PERIODS.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {entry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {period === CUSTOM_PERIOD && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-from`}>From</Label>
            <DatePicker
              id={`${idPrefix}-from`}
              label="From"
              value={from}
              onChange={onFromChange}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-to`}>To</Label>
            <DatePicker
              id={`${idPrefix}-to`}
              label="To"
              value={to}
              onChange={onToChange}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </>
  );
}

export function InlineEmpty({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Empty className="gap-2 py-6 shadow-none">
      <EmptyMedia className="size-10">{icon}</EmptyMedia>
      <EmptyTitle className="text-sm">{title}</EmptyTitle>
      <EmptyDescription className="text-xs">{description}</EmptyDescription>
    </Empty>
  );
}
