"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Layers, X } from "lucide-react";

import { RowIconButton } from "@/components/ui/row-icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reorder, reportTitle, type CatalogueEntry } from "@/lib/report-packs";
import { cn } from "@/lib/utils";
import { InlineEmpty } from "./pack-fields";

const LOCKED = "This pack is locked. Reopen it to change the pages.";

export function ReportPicker({
  catalogue,
  value,
  onChange,
  disabled,
}: {
  catalogue: CatalogueEntry[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const titleOf = (key: string) => reportTitle(catalogue, key);

  const selected = Array.isArray(value) ? value : [];
  const remaining = catalogue.filter((entry) => !selected.includes(entry.key));

  const add = (key: string) => {
    if (!key || selected.includes(key)) return;
    onChange([...selected, key]);
  };

  const move = (from: number, to: number) =>
    onChange(reorder(selected, from, to));
  const remove = (key: string) =>
    onChange(selected.filter((entry) => entry !== key));

  return (
    <div className="space-y-3">
      <Select
        value=""
        onValueChange={add}
        disabled={disabled || remaining.length === 0}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              remaining.length === 0
                ? "Every report is already in this pack"
                : "Choose a report to add…"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {remaining.map((entry) => (
            <SelectItem key={entry.key} value={entry.key}>
              {entry.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected.length === 0 ? (
        <InlineEmpty
          icon={<Layers />}
          title="No reports added yet"
          description="Choose a report above to add the first page."
        />
      ) : (
        <ol className="space-y-2">
          {selected.map((key, index) => (
            <li
              key={key}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-card py-1.5 pl-3 pr-1.5",
                disabled && "opacity-60",
              )}
            >
              <span className="w-5 text-sm tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {titleOf(key)}
              </span>

              <RowIconButton
                icon={<ArrowUp />}
                label={`Move ${titleOf(key)} up`}
                onClick={() => move(index, index - 1)}
                disabledReason={
                  disabled ? LOCKED : index === 0 ? "Already first" : undefined
                }
              />
              <RowIconButton
                icon={<ArrowDown />}
                label={`Move ${titleOf(key)} down`}
                onClick={() => move(index, index + 1)}
                disabledReason={
                  disabled
                    ? LOCKED
                    : index === selected.length - 1
                      ? "Already last"
                      : undefined
                }
              />
              <RowIconButton
                icon={<X />}
                label={`Remove ${titleOf(key)}`}
                destructive
                onClick={() => remove(key)}
                disabledReason={disabled ? LOCKED : undefined}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
