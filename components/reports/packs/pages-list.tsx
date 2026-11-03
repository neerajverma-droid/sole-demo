"use client";

import * as React from "react";
import { BookOpen, Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RowIconButton } from "@/components/ui/row-icon-button";
import type { CatalogueEntry } from "@/lib/report-packs";
import { cn } from "@/lib/utils";
import { ReportPicker } from "./report-picker";

function FrontMatterRow({
  label,
  included,
  onChange,
  disabled,
}: {
  label: string;
  included: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card px-3 py-2",
        !included && "border-dashed bg-transparent",
      )}
    >
      <BookOpen className="size-4 text-muted-foreground" />
      <span
        className={cn(
          "flex-1 text-sm font-medium",
          !included && "text-muted-foreground line-through",
        )}
      >
        {label}
      </span>
      {included ? (
        <RowIconButton
          icon={<X />}
          label={`Remove ${label}`}
          destructive
          onClick={() => onChange(false)}
          disabledReason={
            disabled
              ? "This pack is locked. Reopen it to change the pages."
              : undefined
          }
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(true)}
        >
          <Plus />
          Add back
        </Button>
      )}
    </li>
  );
}

export function PagesList({
  catalogue,
  reports,
  onReportsChange,
  coverEnabled,
  onCoverChange,
  tocEnabled,
  onTocChange,
  onReset,
  resetting,
  disabled,
}: {
  catalogue: CatalogueEntry[];
  reports: string[];
  onReportsChange: (next: string[]) => void;
  coverEnabled: boolean;
  onCoverChange: (next: boolean) => void;
  tocEnabled: boolean;
  onTocChange: (next: boolean) => void;
  onReset?: () => void;
  resetting?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        <FrontMatterRow
          label="Cover page"
          included={coverEnabled}
          onChange={onCoverChange}
          disabled={disabled}
        />
        <FrontMatterRow
          label="Table of contents"
          included={tocEnabled}
          onChange={onTocChange}
          disabled={disabled}
        />
      </ul>

      <ReportPicker
        catalogue={catalogue}
        value={reports}
        onChange={onReportsChange}
        disabled={disabled}
      />

      {onReset && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          onClick={onReset}
          disabled={disabled || resetting}
        >
          <RotateCcw />
          Reset to the template&apos;s pages
        </Button>
      )}
    </div>
  );
}
