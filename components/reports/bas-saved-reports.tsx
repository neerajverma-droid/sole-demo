"use client";

import * as React from "react";
import { ArrowLeft, History } from "lucide-react";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useSavedBasReviewReport,
  useSavedBasReviewReports,
} from "@/hooks/use-bas-review-mutation";
import { basDate } from "@/lib/bas-report";
import { SEVERITY_LABEL, type Decision } from "@/lib/bas-review";

const DECISION_LABEL: Record<Decision, string> = {
  accepted: "Done",
  rejected: "Ignored",
  pending: "Not dealt with",
};

const DECISION_VARIANT: Record<Decision, "success" | "outline" | "warning"> = {
  accepted: "success",
  rejected: "outline",
  pending: "warning",
};

/**
 * Past BAS review reports. Each is a snapshot taken when the user pressed
 * "Save report" — what the review found and what they decided about each
 * finding — so it reads the same later whatever has changed in the books since.
 */
export function BasSavedReports() {
  const [open, setOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const list = useSavedBasReviewReports(open);
  const detail = useSavedBasReviewReport(openId);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setOpenId(null);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          <History />
          Past reports
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Past BAS reviews</SheetTitle>
          <SheetDescription>
            Saved snapshots of a review: what it found and which items you marked done or ignored.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {openId !== null ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                <ArrowLeft />
                All reports
              </Button>
              {detail.isLoading ? (
                <Shimmer className="h-40 w-full rounded-lg" />
              ) : detail.isError || !detail.data ? (
                <p className="text-sm text-destructive">Couldn&apos;t open that report.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground tabular">
                    {basDate(detail.data.periodFrom.slice(0, 10))} –{" "}
                    {basDate(detail.data.periodTo.slice(0, 10))}
                  </p>
                  <p className="text-sm">{detail.data.payload.review.summary}</p>
                  <ul className="space-y-2">
                    {detail.data.payload.review.findings.map((finding) => {
                      const decision =
                        detail.data.payload.decisions[finding.id] ?? "pending";
                      return (
                        <li
                          key={finding.id}
                          className="space-y-1 rounded-lg border border-border p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={DECISION_VARIANT[decision]}>
                              {DECISION_LABEL[decision]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {SEVERITY_LABEL[finding.severity]}
                            </span>
                          </div>
                          <p className="text-sm font-medium">{finding.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {finding.detail}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          ) : list.isLoading ? (
            <Shimmer className="h-40 w-full rounded-lg" />
          ) : list.isError ? (
            <p className="text-sm text-destructive">Couldn&apos;t load saved reports.</p>
          ) : (list.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing saved yet. Run a review and press “Save report”.
            </p>
          ) : (
            <ul className="space-y-2">
              {(list.data ?? []).map((report) => (
                <li key={report.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(report.id)}
                    className="w-full space-y-2 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-2 text-sm font-medium tabular">
                      <span>
                        {basDate(report.periodFrom.slice(0, 10))} –{" "}
                        {basDate(report.periodTo.slice(0, 10))}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        Saved {format(new Date(report.createdAt), "d MMM yyyy")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={report.readiness} className="h-1.5" />
                      <span className="text-xs text-muted-foreground tabular">
                        {report.readiness}% ready
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
