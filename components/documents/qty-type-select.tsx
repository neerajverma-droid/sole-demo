"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_QTY_TYPE,
  QTY_TYPES,
  toQtyType,
  type QtyType,
} from "@/lib/invoices";

/**
 * What a line's quantity counts. It prints on the invoice next to the figure,
 * so "3 hours" doesn't read as "3 items" — which is also why it's per line
 * rather than a document-wide setting.
 *
 * `options` is the list on offer. An ordinary line gets the four general units;
 * an NDIS line passes the Pricing Schedule's own (Hour, Each, Day, Week, Month,
 * Year). A saved line whose unit isn't in the list — an older claim in km — is
 * still shown with its own unit rather than being silently changed.
 */
export function QtyTypeSelect({
  value,
  onChange,
  label,
  options = QTY_TYPES,
}: {
  value: QtyType | undefined;
  onChange: (value: QtyType) => void;
  label: string;
  options?: ReadonlyArray<{ value: QtyType; label: string }>;
}) {
  const current = value ?? DEFAULT_QTY_TYPE;
  const shown = options.some((option) => option.value === current)
    ? options
    : [
        ...options,
        {
          value: current,
          label:
            QTY_TYPES.find((option) => option.value === current)?.label ??
            toQtyType(current),
        },
      ];

  return (
    <Select
      value={current}
      onValueChange={(next) => onChange(next as QtyType)}
    >
      <SelectTrigger className="h-9" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {shown.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
