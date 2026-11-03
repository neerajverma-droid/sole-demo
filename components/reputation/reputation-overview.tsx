"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ClientCell,
  ProgressBar,
  StarRow,
  TONE_TEXT,
  TonePill,
} from "@/components/reputation/reputation-ui";
import {
  feedbackClientLabel,
  feedbackReferenceLabel,
  needsFollowUp,
  npsBand,
  percentOf,
  type ReputationFeedback,
  type ReputationOverview as Overview,
  type ReputationTone,
} from "@/lib/reputation";
import { cn } from "@/lib/utils";

const GAUGE_STROKE: Record<ReputationTone, string> = {
  success: "stroke-success",
  info: "stroke-primary",
  warning: "stroke-warning",
  danger: "stroke-destructive",
  neutral: "stroke-muted-foreground",
  accent: "stroke-teal-600",
};

function MetricCard({
  label,
  loading,
  value,
  valueClassName,
  aside,
  footer,
}: {
  label: string;
  loading: boolean;
  value: React.ReactNode;
  valueClassName?: string;
  aside?: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-medium">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-20" />
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <span className={cn("text-[26px] font-bold leading-tight tabular", valueClassName)}>{value}</span>
          {aside}
        </div>
      )}
      <div className="mt-1 text-xs text-muted-foreground">{footer}</div>
    </div>
  );
}

function NpsGauge({ score }: { score: number }) {
  const band = npsBand(score);
  const arc = Math.PI * 62;
  const filled = Math.max(0, Math.min(1, (score + 100) / 200)) * arc;
  return (
    <div className="relative mx-auto w-[240px]">
      <svg viewBox="0 0 150 92" className="w-full" aria-hidden>
        <path d="M13 78 A62 62 0 0 1 137 78" fill="none" className="stroke-muted" strokeWidth={14} strokeLinecap="round" />
        <path
          d="M13 78 A62 62 0 0 1 137 78"
          fill="none"
          className={GAUGE_STROKE[band.tone]}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${filled.toFixed(2)} ${arc.toFixed(2)}`}
        />
      </svg>
      <div className="absolute inset-x-0 top-[44%] text-center">
        <div className={cn("text-[40px] font-bold leading-none tabular", TONE_TEXT[band.tone])}>{score}</div>
        <TonePill tone={band.tone} className="mt-1.5">
          {band.label}
        </TonePill>
      </div>
      <div className="-mt-3 flex justify-between px-1.5 text-xs text-muted-foreground">
        <span>−100</span>
        <span>+100</span>
      </div>
    </div>
  );
}

function SegmentLegend({ count, share, label, tone }: { count: number; share: number; label: string; tone: ReputationTone }) {
  const dot: Record<ReputationTone, string> = {
    success: "bg-success",
    info: "bg-primary",
    warning: "bg-amber-600",
    danger: "bg-destructive",
    neutral: "bg-muted-foreground",
    accent: "bg-teal-600",
  };
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-1.5">
        <span className={cn("size-2 shrink-0 self-center rounded-full", dot[tone])} />
        <span className="text-lg font-bold tabular">{count}</span>
        <span className="text-xs text-muted-foreground tabular">{share}%</span>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function BandRow({ label, jobs, share, tone }: { label: string; jobs: number; share: number; tone: ReputationTone }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular">
          {jobs} {jobs === 1 ? "job" : "jobs"}
        </span>
      </div>
      <ProgressBar value={share} tone={tone} />
    </div>
  );
}

function FunnelStep({ value, label, share, tone }: { value: number; label: string; share: number; tone: ReputationTone }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold tabular">{value}</span>
        <span className="text-sm">{label}</span>
      </div>
      <ProgressBar value={share} tone={tone} />
    </div>
  );
}

export function ReputationOverview({
  overview,
  overviewLoading,
  feedbacks,
  feedbacksLoading,
  onViewFollowUps,
}: {
  overview: Overview | undefined;
  overviewLoading: boolean;
  feedbacks: ReputationFeedback[];
  feedbacksLoading: boolean;
  onViewFollowUps: () => void;
}) {
  const data = overview ?? {
    npsScore: 0,
    totalResponses: 0,
    totalSent: 0,
    promoters: 0,
    passives: 0,
    detractors: 0,
    averageStarRating: 0,
    publicReviewClicks: 0,
    promptedForPublicReview: 0,
  };
  const band = npsBand(data.npsScore);
  const segmentTotal = data.promoters + data.passives + data.detractors;
  const responses = Math.max(data.totalResponses, segmentTotal);
  const positive = data.promoters + data.passives;
  const followUps = feedbacks.filter(needsFollowUp);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="NPS Score"
          loading={overviewLoading}
          value={data.npsScore}
          valueClassName={TONE_TEXT[band.tone]}
          aside={<TonePill tone={band.tone}>{band.label}</TonePill>}
          footer="Based on survey responses · Range: −100 to +100"
        />
        <MetricCard
          label="Avg star rating"
          loading={overviewLoading}
          value={data.averageStarRating.toFixed(1)}
          footer={<StarRow rating={data.averageStarRating} size={13} />}
        />
        <MetricCard
          label="Response rate"
          loading={overviewLoading}
          value={`${percentOf(data.totalResponses, data.totalSent)}%`}
          footer={`${data.totalResponses} ${data.totalResponses === 1 ? "response" : "responses"} out of ${data.totalSent} sent`}
        />
        <MetricCard
          label="Public reviews driven"
          loading={overviewLoading}
          value={data.publicReviewClicks}
          valueClassName="text-success"
          footer={`${data.publicReviewClicks === 1 ? "client" : "clients"} clicked review link`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold">Net Promoter Score</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">% promoters − % detractors · −100 to +100</p>
          {overviewLoading ? (
            <Skeleton className="mx-auto mt-4 h-[150px] w-[240px]" />
          ) : (
            <>
              <div className="mt-3">
                <NpsGauge score={data.npsScore} />
              </div>
              <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
                <div className="bg-success" style={{ width: `${percentOf(data.promoters, responses)}%` }} />
                <div className="bg-amber-600" style={{ width: `${percentOf(data.passives, responses)}%` }} />
                <div className="bg-destructive" style={{ width: `${percentOf(data.detractors, responses)}%` }} />
              </div>
              <div className="mt-3 flex gap-3">
                <SegmentLegend count={data.promoters} share={percentOf(data.promoters, responses)} label="Promoters" tone="success" />
                <SegmentLegend count={data.passives} share={percentOf(data.passives, responses)} label="Passives" tone="warning" />
                <SegmentLegend count={data.detractors} share={percentOf(data.detractors, responses)} label="Detractors" tone="danger" />
              </div>
            </>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold">Client experience by band</h3>
          {overviewLoading ? (
            <div className="mt-5 space-y-5">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <BandRow label="Excellent (5★)" jobs={data.promoters} share={percentOf(data.promoters, responses)} tone="success" />
              <BandRow label="Good (4★)" jobs={data.passives} share={percentOf(data.passives, responses)} tone="success" />
              <BandRow
                label="Needs attention (1–3★)"
                jobs={data.detractors}
                share={percentOf(data.detractors, responses)}
                tone="warning"
              />
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-semibold">Public review funnel</h3>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          <FunnelStep value={positive} label="Positive ratings (4–5★)" share={positive > 0 ? 100 : 0} tone="info" />
          <FunnelStep
            value={data.promptedForPublicReview}
            label="Prompted for a public review"
            share={percentOf(data.promptedForPublicReview, positive)}
            tone="info"
          />
          <FunnelStep
            value={data.publicReviewClicks}
            label="Clicked through to review"
            share={percentOf(data.publicReviewClicks, positive)}
            tone="success"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="size-[18px]" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">Needs follow-up</p>
              <p className="text-xs text-muted-foreground">
                Low ratings to make right — reach out and recover the relationship
              </p>
            </div>
          </div>
          {!feedbacksLoading && <TonePill tone="danger">{followUps.length} open</TonePill>}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-5">Client</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead className="px-5 text-right">
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {feedbacksLoading ? (
              Array.from({ length: 3 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell className="px-5" colSpan={3}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : followUps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                  No follow-ups needed!
                </TableCell>
              </TableRow>
            ) : (
              followUps.slice(0, 5).map((feedback) => (
                <TableRow key={feedback.id}>
                  <TableCell className="px-5 py-3">
                    <ClientCell name={feedbackClientLabel(feedback)} subtitle={feedbackReferenceLabel(feedback)} />
                  </TableCell>
                  <TableCell>
                    <StarRow rating={feedback.starRating ?? 0} />
                  </TableCell>
                  <TableCell className="px-5 text-right">
                    <Button variant="outline" size="sm" onClick={onViewFollowUps}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
