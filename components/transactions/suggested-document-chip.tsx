"use client";

import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { invoiceMoney } from "@/lib/invoices";
import type { SuggestedDocument, SuggestedDocumentType } from "@/lib/transactions";
import { cn } from "@/lib/utils";

export const DOCUMENT_LABEL: Record<SuggestedDocumentType, string> = {
  invoice: "Invoice",
  expense: "Expense",
  asset: "Asset",
};

/**
 * The invoice, expense or asset the model paired a bank line with — the
 * answer it looks for before it suggests any category, so it takes the
 * category dropdown's place on the row.
 *
 * "Choose category" hands the row back to the dropdown for someone who knows
 * the pairing is wrong; without it a bad guess could only be rejected, not
 * corrected.
 */
export function SuggestedDocumentChip({
  suggestion,
  onChooseCategory,
  className,
}: {
  suggestion: SuggestedDocument;
  onChooseCategory?: () => void;
  className?: string;
}) {
  const label = DOCUMENT_LABEL[suggestion.type];
  const detail = [
    suggestion.clientName,
    invoiceMoney(suggestion.amount),
    suggestion.reason,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="min-w-0 max-w-full gap-1 border-dashed border-primary/40 bg-primary/5 px-1.5 py-0.5 text-xs font-medium text-foreground"
          >
            <Sparkles className="size-3 shrink-0 text-primary" aria-hidden />
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className="truncate">{suggestion.reference}</span>
            {suggestion.confidence !== null && (
              <span className="shrink-0 tabular text-muted-foreground">
                {suggestion.confidence}%
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">
          Matches {label.toLowerCase()} {suggestion.reference}
          {detail ? ` — ${detail}` : ""}
        </TooltipContent>
      </Tooltip>
      {onChooseCategory && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 px-1.5 text-xs text-muted-foreground"
          onClick={onChooseCategory}
        >
          Choose category
        </Button>
      )}
    </div>
  );
}
