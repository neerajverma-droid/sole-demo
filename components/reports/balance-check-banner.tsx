"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * The one indicator both ladder reports share: does the ledger actually
 * balance. Balance Sheet checks assets against liabilities plus equity per
 * year; Trial Balance checks total debits against total credits overall — two
 * different sums, but the same true/false fact and the same reason to show it
 * prominently, so one banner serves both.
 *
 * `sole-webapp`'s own Balance Sheet screen never rendered this even though the
 * backend already computes it — a real, already-derived figure worth
 * surfacing rather than leaving the reader to add the columns themselves.
 */
export function BalanceCheckBanner({
  balanced,
  title,
  description,
}: {
  balanced: boolean;
  title: string;
  description: string;
}) {
  return (
    <Alert
      className={cn(
        balanced
          ? "border-success/30 bg-success/10 text-success [&>svg]:text-success"
          : "border-destructive/30 bg-destructive/10 text-destructive [&>svg]:text-destructive",
      )}
    >
      {balanced ? <CheckCircle2 /> : <TriangleAlert />}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className={balanced ? "text-success/90" : "text-destructive/90"}>
        {description}
      </AlertDescription>
    </Alert>
  );
}
