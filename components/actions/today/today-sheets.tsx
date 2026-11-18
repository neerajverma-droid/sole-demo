"use client";

import * as React from "react";
import { Bell, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Sparkles } from "lucide-react";

import { GetPaidCard } from "@/components/actions/unibox/get-paid-card";
import { BankFeedCard } from "@/components/actions/unibox/bank-feed-card";
import { KmTrackerCard } from "@/components/actions/unibox/km-tracker-card";
import {
  AssetsCard,
  EquityCard,
  ExpensesCard,
  LiabilitiesCard,
} from "@/components/actions/unibox/matchable-cards";
import { ProgressCard } from "@/components/actions/unibox/progress-card";
import { ProjectsCard } from "@/components/actions/unibox/projects-card";
import { TimeTrackerCard } from "@/components/actions/unibox/time-tracker-card";
import { UniboxCardPlacement } from "@/components/actions/unibox/unibox-ui";
import { WorkComingUpCard } from "@/components/actions/unibox/work-coming-up-card";
import { TILE_SPECS } from "@/components/actions/today/today-parts";
import { TodaySheet } from "@/components/actions/today/today-sheet";
import { Button } from "@/components/ui/button";
import type { TodayLayout } from "@/hooks/use-today-layout";
import type { AppNotification } from "@/lib/notifications";
import { LAYOUT_ITEMS, type LayoutKey } from "@/lib/quick-actions-today";
import { daysAgo, type UniboxProgress } from "@/lib/unibox";
import { activityDayLabel } from "@/lib/unibox-rules";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * A tile's sheet — the module's existing card, with its own actions
 * ------------------------------------------------------------------ */

const TILE_BODY: Record<string, () => React.ReactElement> = {
  getpaid: () => <GetPaidCard />,
  bank: () => <BankFeedCard />,
  expenses: () => <ExpensesCard />,
  time: () => <TimeTrackerCard />,
  assets: () => <AssetsCard />,
  progress: () => <ProgressCard />,
  projects: () => <ProjectsCard />,
  work: () => <WorkComingUpCard />,
  km: () => <KmTrackerCard />,
  liabilities: () => <LiabilitiesCard />,
  equity: () => <EquityCard />,
};

/**
 * Tapping a tile opens its module here — the same list, the same row actions
 * and the same "New / Log …" flow the module has everywhere else, drawn inside
 * the sheet rather than a card of its own.
 */
export function TileSheet({ tile, onOpenChange }: { tile: LayoutKey | null; onOpenChange: (open: boolean) => void }) {
  const spec = tile ? TILE_SPECS[tile] : null;
  const Body = tile ? TILE_BODY[tile] : null;
  return (
    <TodaySheet open={tile !== null} onOpenChange={onOpenChange} title={spec?.label ?? ""}>
      <UniboxCardPlacement.Provider value="sheet">{Body ? <Body /> : null}</UniboxCardPlacement.Provider>
    </TodaySheet>
  );
}

/* ------------------------------------------------------------------ *
 * While you were away
 * ------------------------------------------------------------------ */

function when(date: string): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${daysAgo(date)} · ${parsed.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * The updates since the user was last here — the app's own notifications.
 * Each opens its detail with a way back; "Mark all as seen" clears the count.
 */
export function UpdatesSheet({
  open,
  onOpenChange,
  updates,
  onMarkAllSeen,
  marking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updates: AppNotification[];
  onMarkAllSeen: () => void;
  marking: boolean;
}) {
  const [detail, setDetail] = React.useState<AppNotification | null>(null);
  React.useEffect(() => {
    if (!open) setDetail(null);
  }, [open]);

  if (detail) {
    return (
      <TodaySheet
        open={open}
        onOpenChange={onOpenChange}
        title={detail.title || "Update"}
        description={when(detail.date)}
        footer={
          <Button variant="outline" onClick={() => setDetail(null)}>
            <ChevronLeft />
            Back to updates
          </Button>
        }
      >
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {detail.message || "No more detail on this one."}
        </p>
      </TodaySheet>
    );
  }

  const n = updates.length;
  return (
    <TodaySheet
      open={open}
      onOpenChange={onOpenChange}
      title="While you were away"
      description={n ? `${n} ${n === 1 ? "update" : "updates"}` : "Nothing new"}
      footer={
        n ? (
          <Button onClick={onMarkAllSeen} disabled={marking}>
            Mark all as seen
          </Button>
        ) : undefined
      }
    >
      {n ? (
        <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
          {updates.map((update) => (
            <button
              key={update.id}
              type="button"
              onClick={() => setDetail(update)}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
            >
              <Bell className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{update.title || update.message}</span>
                <small className="block truncate text-xs text-muted-foreground">
                  {update.title ? update.message : when(update.date)}
                </small>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing new since you were last here.</p>
      )}
    </TodaySheet>
  );
}

/* ------------------------------------------------------------------ *
 * Streak
 * ------------------------------------------------------------------ */

/** The streak and the last seven days of activity behind it. */
export function StreakSheet({
  open,
  onOpenChange,
  progress,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: UniboxProgress | null | undefined;
}) {
  const streak = progress?.streak?.current ?? 0;
  const counts = (progress?.activity?.counts ?? []).slice(-7);
  const now = Date.now();
  return (
    <TodaySheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${streak}-day streak`}
      description="How it works"
      footer={<Button onClick={() => onOpenChange(false)}>Got it</Button>}
    >
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">
        {counts.map((count, index) => {
          const today = index === counts.length - 1;
          const label = activityDayLabel(index, counts.length, now);
          return (
            <div key={index}>
              {today ? "Today" : label.split(" ")[0]}
              <i
                className={cn(
                  "mt-1 grid h-8 place-items-center rounded-full border-[1.5px] border-dashed border-border not-italic text-white",
                  count > 0 && "border-0 bg-warning",
                  today && "border-solid border-primary",
                )}
                title={`${label}: ${count} ${count === 1 ? "action" : "actions"}`}
              >
                {count > 0 ? <Check className="size-4" aria-hidden /> : null}
              </i>
            </div>
          );
        })}
      </div>
      <ul className="mt-4 divide-y divide-border text-sm text-muted-foreground">
        <li className="py-2.5">A ticked day is one where you completed at least one action.</li>
        <li className="py-2.5">
          {progress?.activity?.total_this_week ?? 0} actions this week ·{" "}
          {progress?.activity?.comparison?.label ?? "Same as last week"}
        </li>
      </ul>
    </TodaySheet>
  );
}

/* ------------------------------------------------------------------ *
 * Customise
 * ------------------------------------------------------------------ */

export function CustomiseSheet({
  open,
  onOpenChange,
  layout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: TodayLayout;
}) {
  const movable = layout.layout.order.filter((key) => key !== "away");
  const row = (key: LayoutKey, index: number, canMove: boolean) => {
    const item = LAYOUT_ITEMS.find((entry) => entry.key === key)!;
    const on = layout.layout.on[key];
    return (
      <div key={key} className={cn("flex items-center gap-3 border-t border-border/60 py-2.5 text-sm", !on && "text-muted-foreground")}>
        <input
          type="checkbox"
          className="size-[1.1rem] shrink-0 cursor-pointer accent-primary"
          checked={on}
          onChange={() => layout.toggle(key)}
          aria-label={`Show ${item.label}`}
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate">{item.label}</span>
          {item.recommended ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">
              Recommended
            </span>
          ) : null}
        </span>
        {canMove ? (
          <span className="flex gap-1">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => layout.move(key, "up")}
              aria-label={`Move ${item.label} up`}
              className="grid size-7 place-items-center rounded-md border border-border bg-card text-muted-foreground disabled:opacity-35"
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={index === movable.length - 1}
              onClick={() => layout.move(key, "down")}
              aria-label={`Move ${item.label} down`}
              className="grid size-7 place-items-center rounded-md border border-border bg-card text-muted-foreground disabled:opacity-35"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </span>
        ) : (
          <span className="w-[3.75rem]" aria-hidden />
        )}
      </div>
    );
  };

  return (
    <TodaySheet
      open={open}
      onOpenChange={onOpenChange}
      title="Customise your screen"
      description="Choose what to show and in what order."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
          <Button variant="outline" onClick={layout.reset}>
            Use recommended
          </Button>
        </>
      }
    >
      <div className="mb-2 flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-xs leading-snug text-muted-foreground">
        <Sparkles className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
        Recommended items suit a small business.
      </div>
      {row("away", 0, false)}
      {movable.map((key, index) => row(key, index, true))}
    </TodaySheet>
  );
}
