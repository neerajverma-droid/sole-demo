"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  FormattingValue,
  LogoPosition,
  LogoSize,
  NegativeFormat,
  Orientation,
} from "@/lib/report-packs";

type Props = {
  idPrefix: string;
  value: FormattingValue;
  onChange: (patch: Partial<FormattingValue>) => void;
  disabled?: boolean;
};

const NEGATIVES_HELP =
  "How losses, credits and refunds print. Accountants usually expect brackets; a minus sign is easier to paste into a spreadsheet.";

const ZERO_HELP =
  "Leaves out accounts with nothing in them on the Profit & Loss, Balance Sheet and Trial Balance. Totals don't change.";

function CheckRow({
  id,
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  help?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        disabled={disabled}
      />
      <Label htmlFor={id} className="flex items-center gap-1.5 font-normal">
        {label}
        {help && <InfoTip text={help} />}
      </Label>
    </div>
  );
}

export function ReportPreferenceFields({
  idPrefix,
  value,
  onChange,
  disabled,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <Label className="flex items-center gap-1.5">
          Negative amounts
          <InfoTip text={NEGATIVES_HELP} />
        </Label>
        <RadioGroup
          value={value.negative_format}
          onValueChange={(next) =>
            onChange({ negative_format: next as NegativeFormat })
          }
          disabled={disabled}
          className="gap-2"
        >
          <div className="flex items-center gap-2.5">
            <RadioGroupItem
              id={`${idPrefix}-negatives-brackets`}
              value="brackets"
            />
            <Label
              htmlFor={`${idPrefix}-negatives-brackets`}
              className="font-normal"
            >
              In brackets{" "}
              <span className="tabular-nums text-muted-foreground">
                (1,000.00)
              </span>
            </Label>
          </div>
          <div className="flex items-center gap-2.5">
            <RadioGroupItem id={`${idPrefix}-negatives-minus`} value="minus" />
            <Label
              htmlFor={`${idPrefix}-negatives-minus`}
              className="font-normal"
            >
              With a minus sign{" "}
              <span className="tabular-nums text-muted-foreground">
                -1,000.00
              </span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2.5">
        <Label>Show in the reports</Label>
        <CheckRow
          id={`${idPrefix}-zero`}
          label="Accounts with zero balances"
          help={ZERO_HELP}
          checked={!value.hide_zero_balances}
          onChange={(next) => onChange({ hide_zero_balances: !next })}
          disabled={disabled}
        />
        <CheckRow
          id={`${idPrefix}-symbol`}
          label="Currency symbols"
          checked={value.show_currency_symbol}
          onChange={(next) => onChange({ show_currency_symbol: next })}
          disabled={disabled}
        />
        <CheckRow
          id={`${idPrefix}-cents`}
          label="Cents"
          checked={value.show_cents}
          onChange={(next) => onChange({ show_cents: next })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-orientation`}>Page orientation</Label>
        <Select
          value={value.orientation}
          onValueChange={(next) =>
            onChange({ orientation: next as Orientation })
          }
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-orientation`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="portrait">Portrait</SelectItem>
            <SelectItem value="landscape">
              Landscape — better for wide tables
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function BrandingFields({ idPrefix, value, onChange, disabled }: Props) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Colours and the default logo come from Sales → Branding, so packs match
        your invoices.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-logo-position`}>Logo placement</Label>
          <Select
            value={value.logo_position}
            onValueChange={(next) =>
              onChange({ logo_position: next as LogoPosition })
            }
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-logo-position`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Centre</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-logo-size`}>Logo size</Label>
          <Select
            value={value.logo_size}
            onValueChange={(next) => onChange({ logo_size: next as LogoSize })}
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-logo-size`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`${idPrefix}-logo-every-page`} className="font-normal">
          Show the logo on every page, not just the cover
        </Label>
        <Switch
          id={`${idPrefix}-logo-every-page`}
          checked={value.logo_on_every_page}
          onCheckedChange={(next) => onChange({ logo_on_every_page: next })}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`${idPrefix}-confidential`} className="font-normal">
          Mark every page Confidential
        </Label>
        <Switch
          id={`${idPrefix}-confidential`}
          checked={value.confidential}
          onCheckedChange={(next) => onChange({ confidential: next })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
