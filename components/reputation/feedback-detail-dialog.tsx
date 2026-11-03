"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Mail, RotateCcw, ShieldCheck, Wrench, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StarRow, TonePill } from "@/components/reputation/reputation-ui";
import {
  extraBreakdown,
  feedbackClientLabel,
  feedbackReferenceLabel,
  feedbackRouted,
  feedbackScore,
  feedbackSegment,
  feedbackStatus,
  issueCategory,
  RECOVERY_ACTIONS,
  wantsCallback,
  type FeedbackUpdate,
  type ReputationFeedback,
} from "@/lib/reputation";
import { cn } from "@/lib/utils";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border py-2.5 first:border-t-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  );
}

function PipelineStep({ index, title, hint, state }: { index: number; title: string; hint: string; state: "done" | "current" | "todo" }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
          state === "done" && "bg-success/15 text-success",
          state === "current" && "bg-primary text-primary-foreground",
          state === "todo" && "bg-muted text-muted-foreground",
        )}
      >
        {state === "done" ? <CheckCircle2 className="size-4" aria-hidden /> : index}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </li>
  );
}

export function FeedbackDetailDialog({
  open,
  feedback,
  onClose,
  onUpdate,
  onSendRecoveryEmail,
}: {
  open: boolean;
  feedback: ReputationFeedback | null;
  onClose: () => void;
  onUpdate: (feedback: ReputationFeedback, update: FeedbackUpdate, success: string) => Promise<boolean>;
  onSendRecoveryEmail: (feedback: ReputationFeedback) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => setBusy(null), [feedback?.id]);

  if (!feedback) return null;

  const status = feedbackStatus(feedback);
  const score = feedbackScore(feedback);
  const detractor = feedbackSegment(feedback) === "detractor";
  const started = feedback.recoveryStatus === "started";
  const completed = feedback.recoveryStatus === "completed" || feedback.isClosed;
  const category = issueCategory(feedback);
  const callback = wantsCallback(feedback);
  const extras = extraBreakdown(feedback);

  const apply = async (key: keyof typeof RECOVERY_ACTIONS, success: string) => {
    setBusy(key);
    await onUpdate(feedback, RECOVERY_ACTIONS[key], success);
    setBusy(null);
  };

  const spinner = (key: string) => (busy === key ? <Loader2 className="animate-spin" /> : null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <DialogTitle>{feedbackClientLabel(feedback)}</DialogTitle>
            <TonePill tone={status.tone}>{status.label}</TonePill>
          </div>
          <DialogDescription>{feedbackReferenceLabel(feedback)}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 rounded-lg border border-border p-4">
          <Detail label="Rating">{feedback.starRating ? <StarRow rating={feedback.starRating} /> : "Not rated yet"}</Detail>
          <Detail label="Score">{score ? <TonePill tone={score.tone}>{score.label}</TonePill> : "—"}</Detail>
          <Detail label="Routed">{feedbackRouted(feedback)}</Detail>
          {feedback.clientEmail && <Detail label="Email">{feedback.clientEmail}</Detail>}
          {category && <Detail label="Issue category">{category}</Detail>}
          {callback !== null && <Detail label="Callback requested">{callback ? "Yes" : "No"}</Detail>}
          {extras.map((item, index) => (
            <Detail key={`${item.label}-${index}`} label={item.label}>
              {item.valueText || (item.score !== null && item.max !== null ? `${item.score}/${item.max}` : "—")}
            </Detail>
          ))}
        </div>

        {feedback.feedbackText && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What they said</p>
            <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm leading-relaxed">{feedback.feedbackText}</p>
          </div>
        )}

        {detractor && (
          <div className="mt-4 rounded-lg border border-border p-4">
            <p className="text-sm font-semibold">Service recovery pipeline</p>
            <ol className="mt-3 space-y-3">
              <PipelineStep index={1} title="Captured" hint="Private feedback saved — only you can see it." state="done" />
              <PipelineStep
                index={2}
                title="Recovery"
                hint="Reach out, apologise and make it right."
                state={completed ? "done" : started ? "current" : "todo"}
              />
              <PipelineStep
                index={3}
                title="Resolution"
                hint="Close the case once the issue is resolved."
                state={completed ? "done" : "todo"}
              />
            </ol>
          </div>
        )}

        <DialogFooter className="mt-6 flex-wrap gap-2 sm:justify-end">
          {feedback.isClosed ? (
            <Button variant="outline" disabled={!!busy} onClick={() => void apply("reopen", "Case reopened")}>
              {spinner("reopen") ?? <RotateCcw />}
              Reopen case
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled={!!busy} onClick={() => void apply("close", "Case closed")}>
                {spinner("close") ?? <XCircle />}
                Close case
              </Button>
              {detractor && !started && (
                <Button disabled={!!busy} onClick={() => void apply("start", "Service recovery started")}>
                  {spinner("start") ?? <Wrench />}
                  Start service recovery
                </Button>
              )}
              {detractor && started && (
                <>
                  <Button variant="outline" disabled={!!busy || !feedback.clientEmail} onClick={() => onSendRecoveryEmail(feedback)}>
                    <Mail />
                    Send recovery email
                  </Button>
                  <Button disabled={!!busy} onClick={() => void apply("complete", "Recovery completed and case closed")}>
                    {spinner("complete") ?? <ShieldCheck />}
                    Complete recovery &amp; close
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
