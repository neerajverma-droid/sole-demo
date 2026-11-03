"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SurveyResponseFlow } from "@/components/survey/survey-response-flow";
import { normalizeSettings, type ReputationSettings } from "@/lib/reputation";
import type { PublicSurvey } from "@/lib/public-survey";

/** A sample job — the service's own feedback requests have no job title to preview with. */
const SAMPLE_JOB_NAME = "BAS — Q3 FY26";

export function ReviewPreviewDialog({
  open,
  onOpenChange,
  businessName,
  settings,
  question,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName: string;
  settings: ReputationSettings | undefined;
  question: string;
}) {
  const survey: PublicSurvey = {
    id: "preview",
    referenceName: SAMPLE_JOB_NAME,
    clientName: "",
    settings: settings ?? normalizeSettings(undefined),
    question,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-0 p-0 sm:max-w-[500px]">
        <DialogHeader className="border-b border-border bg-background p-5 text-left">
          <DialogTitle>Web review page</DialogTitle>
          <DialogDescription>
            The client taps the link and lands on this page — from any device. Click through it exactly as they
            would; nothing here is submitted or sent.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center bg-background p-6">
          <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border shadow-sm" style={{ maxHeight: "min(620px, 78vh)" }}>
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
              </div>
              <span className="mx-auto rounded-md border border-border bg-background px-2.5 py-1 text-[10.5px] text-muted-foreground">
                soleapp.com.au
              </span>
              <span className="w-8" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <SurveyResponseFlow survey={survey} initialRating={0} firmName={businessName || undefined} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
