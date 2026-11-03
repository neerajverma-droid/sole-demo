"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_QTY_TYPE, QTY_TYPES, type QtyType } from "@/lib/invoices";

/**
 * What a line's quantity counts. It prints on the invoice next to the figure,
 * so "3 hours" doesn't read as "3 items" — which is also why it's per line
 * rather than a document-wide setting.
 */
export function QtyTypeSelect({
  value,
  onChange,
  label,
}: {
  value: QtyType | undefined;
  onChange: (value: QtyType) => void;
  label: string;
}) {
  return (
    <Select
      value={value ?? DEFAULT_QTY_TYPE}
      onValueChange={(next) => onChange(next as QtyType)}
    >
      <SelectTrigger className="h-9" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {QTY_TYPES.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
