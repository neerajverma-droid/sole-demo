"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronUp, Flame, Target } from "lucide-react";
import { toast } from "sonner";

import { BankFeedCard, BankMatchHost } from "@/components/actions/unibox/bank-feed-card";
import type { CardVisibility } from "@/components/actions/unibox/customise-menu";
import { GetPaidCard } from "@/components/actions/unibox/get-paid-card";
import { KmTrackerCard } from "@/components/actions/unibox/km-tracker-card";
import {
  AssetsCard,
  EquityCard,
  ExpensesCard,
  LiabilitiesCard,
} from "@/components/actions/unibox/matchable-cards";
import { PriorityList } from "@/components/actions/unibox/priority-list";
import { ProgressCard } from "@/components/actions/unibox/progress-card";
import { ProjectsCard } from "@/components/actions/unibox/projects-card";
import { TimeTrackerCard } from "@/components/actions/unibox/time-tracker-card";
import { WorkComingUpCard } from "@/components/actions/unibox/work-coming-up-card";
import { useCelebrationConfetti } from "@/components/onboarding/use-celebration-confetti";
import { CountUp } from "@/components/ui/count-up";
import { Skeleton } from "@/components/ui/skeleton";
import { useSuggestionsCount } from "@/hooks/use-bank-transactions-query";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { useUniboxQuery } from "@/hooks/use-unibox-query";
import { useTourDemoStore } from "@/stores/tour-demo";
import { SampleTag } from "@/components/actions/unibox/unibox-ui";
import { pendingQuickStart } from "@/lib/unibox";
import {
  TOP_N,
  clearedPriorityIds,
  heroView,
  runBursts,
  runCopy,
  runToast,
  topFive,
} from "@/lib/unibox-rules";
import { cn } from "@/lib/utils";

/*
 * The ring's geometry: radius inset by half the stroke so it isn't clipped,
 * and the dash length its circumference so the offset is a fraction of the arc.
 */
const RING_SIZE = 46;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Heat by run length — amber, orange, then red, as the design's flame warms. */
const HEAT = ["", "", "text-amber-500", "text-orange-500", "text-orange-600", "text-red-500"];

/** A burst, expressed by mounting — the confetti hook fires once on mount. */
function Burst() {
  useCelebrationConfetti();
  return null;
}

/**
 * The Data tab: where the business stands, the five things worth doing now,
 * and every other card behind one press — sole-webapp's Quick Actions page on
 * this app's components.
 */
export function UniboxDataTab({ cards }: { cards: CardVisibility }) {
  const reduced = usePrefersReducedMotion();
  const progressQuery = useUniboxQuery("progress");
  const prioritiesQuery = useUniboxQuery("priorities");
  const onboardingQuery = useUniboxQuery("onboarding");
  const suggestionsQuery = useSuggestionsCount();
  const sampleShown = useTourDemoStore((state) => Object.values(state.sampled).some(Boolean));

  const progress = progressQuery.data;
  const priorities = React.useMemo(() => prioritiesQuery.data ?? [], [prioritiesQuery.data]);
  // While the tour is filling the five with examples, the "Getting started"
  // rows would take their slots — the tour shows what a full list looks like.
  const quickStart = prioritiesQuery.isDemo ? [] : pendingQuickStart(onboardingQuery.data);
  const aiCount = suggestionsQuery.data ?? 0;
  const hasAi = aiCount > 0;

  // The five are shared: setup suggestions first, then the AI review, then
  // the server's priorities in whatever slots are left.
  const { visible: visibleItems, leftToAction, toAction } = topFive({
    quickStartCount: quickStart.length,
    aiCount,
    priorities,
    toActionFromServer: progress?.health?.to_action,
  });
  const loading = prioritiesQuery.isLoading || progressQuery.isLoading;

  const { score, status: healthLabel, healthy, streak } = heroView(progress);

  /*
   * This sitting's progress. A priority counts as cleared once something was
   * done to it *and* it has left the server's list — so a dialog cancelled
   * halfway, or a reminder the server still wants chased, isn't counted.
   */
  const [touched, setTouched] = React.useState<Set<string>>(() => new Set());
  const clearedIds = React.useMemo(() => clearedPriorityIds(touched, priorities), [touched, priorities]);
  const cleared = clearedIds.length;
  const total = cleared + toAction;
  const fraction = total === 0 ? 1 : cleared / total;

  const [run, setRun] = React.useState(0);
  const [pulse, setPulse] = React.useState(0);
  const [bursts, setBursts] = React.useState(0);
  const lastCleared = React.useRef(0);
  const runRef = React.useRef(0);

  const breakRun = () => {
    runRef.current = 0;
    setRun(0);
  };

  React.useEffect(() => {
    const gained = cleared - lastCleared.current;
    lastCleared.current = cleared;
    if (gained <= 0) return;
    const next = runRef.current + gained;
    runRef.current = next;
    setRun(next);
    setPulse((count) => count + 1);
    const message = runToast(next);
    if (message) toast.success(message);
    if (runBursts(next)) setBursts((count) => count + 1);
  }, [cleared]);

  /*
   * Everything else opens by itself once the five are empty — the promise the
   * bar makes — and otherwise waits to be asked.
   */
  const [showEverything, setShowEverything] = React.useState(true);
  const topEmpty = !loading && visibleItems.length === 0 && quickStart.length === 0 && !hasAi;
  React.useEffect(() => {
    if (topEmpty) setShowEverything(true);
  }, [topEmpty]);

  /*
   * The all-clear panel waits for the last row to finish leaving — swapping
   * the list out at once would cut its exit off mid-fade.
   */
  const [allClear, setAllClear] = React.useState(false);
  React.useEffect(() => {
    if (!topEmpty) {
      setAllClear(false);
      return;
    }
    const timer = window.setTimeout(() => setAllClear(true), reduced ? 0 : 350);
    return () => window.clearTimeout(timer);
  }, [topEmpty, reduced]);

  const copy = runCopy(run, total);
  const firstBlock = {
    headline:
      run >= 2 ? (
        <span className={cn("flex items-center gap-1.5", HEAT[Math.min(run, 5)] || "text-amber-500")}>
          <Flame
            className={cn(
              "size-4 fill-current drop-shadow-[0_0_5px_rgba(245,158,11,0.6)]",
              !reduced && "animate-ember",
            )}
            aria-hidden
          />
          {copy.headline}
        </span>
      ) : total === 0 ? (
        <span className="text-success">{copy.headline}</span>
      ) : (
        copy.headline
      ),
    sub: copy.sub,
  };

  const visible = cards.isVisible;
  const grid: React.ReactNode[] = [
    visible("get_paid") && <GetPaidCard key="get_paid" />,
    visible("bank_feed") && <BankFeedCard key="bank_feed" />,
    visible("expenses") && <ExpensesCard key="expenses" />,
    visible("progress") && <ProgressCard key="progress" />,
    visible("time_tracker") && <TimeTrackerCard key="time_tracker" />,
    visible("assets") && <AssetsCard key="assets" />,
    visible("projects") && <ProjectsCard key="projects" />,
    visible("work_coming_up") && <WorkComingUpCard key="work_coming_up" />,
    visible("km_tracker") && <KmTrackerCard key="km_tracker" />,
    visible("liabilities_equity") && <LiabilitiesCard key="liabilities" />,
    visible("liabilities_equity") && <EquityCard key="equity" />,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <BankMatchHost />
      {!reduced && bursts > 0 ? <Burst key={bursts} /> : null}

      {/* Samples only draw while the tour runs; this says so, and that they leave with it. */}
      {sampleShown ? (
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          <span className="font-semibold uppercase tracking-wide">Sample</span>
          <span className="text-foreground/80">
            Empty cards are showing example rows while this tour runs, so you can see how each one works.
            They disappear when the tour ends.
          </span>
        </div>
      ) : null}

      {/* Where things stand: this sitting's ring, the run, health, what's left, the streak. */}
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
        data-usertour="quick-actions-status"
      >
        <div
          key={pulse}
          className={cn("relative grid shrink-0 place-items-center", pulse > 0 && !reduced && "animate-goal-pop")}
          style={{ width: RING_SIZE, height: RING_SIZE }}
        >
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="absolute inset-0 -rotate-90"
            aria-hidden
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              strokeWidth={RING_STROKE}
              className="stroke-muted"
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - fraction)}
              className={cn(
                total > 0 && cleared >= total ? "stroke-success" : "stroke-primary",
                !reduced && "transition-[stroke-dashoffset] duration-500 ease-out",
              )}
            />
          </svg>
          {loading ? (
            <Skeleton className="size-6 rounded-full" />
          ) : total > 0 && cleared >= total ? (
            <Check className="size-5 text-success" aria-label="Everything cleared" />
          ) : (
            <span className="text-sm font-semibold tabular" aria-label={`${cleared} of ${total} cleared`}>
              {cleared}
              <span className="text-[10px] font-semibold text-muted-foreground">/{total}</span>
            </span>
          )}
        </div>

        <div className="min-w-[160px] flex-1">
          <p className="text-sm font-semibold">{firstBlock.headline}</p>
          <p className="text-xs text-muted-foreground">{firstBlock.sub}</p>
        </div>

        <div className="border-border sm:border-l sm:pl-5">
          {loading ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            <p className={cn("text-sm font-semibold", healthy ? "text-success" : "text-warning")}>
              <span className="tabular">{score}</span>
              {healthLabel ? <span className="ml-1.5 text-xs">{healthLabel}</span> : null}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Business health</p>
        </div>

        <div className="border-border sm:border-l sm:pl-5">
          <div className="text-sm font-semibold tabular">
            {loading ? <Skeleton className="h-4 w-8" /> : <CountUp value={toAction} />}
          </div>
          <p className="text-xs text-muted-foreground">items awaiting</p>
        </div>

        {!loading && streak > 0 ? (
          <div className="border-border sm:border-l sm:pl-5" data-usertour="quick-actions-streak">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Flame
                className={cn("size-4 fill-amber-500 text-amber-500", !reduced && "animate-ember")}
                aria-hidden
              />
              {streak}-day streak
            </p>
            <p className="text-xs text-muted-foreground">keep it alive</p>
          </div>
        ) : null}
      </div>

      {/* The five. */}
      <section
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
        data-usertour="quick-actions-priorities"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Target className="size-4 text-primary" aria-hidden />
          If you&apos;ve got 5 minutes
          {prioritiesQuery.isDemo ? <SampleTag /> : null}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your {TOP_N} most urgent — clear one and the next moves up.
        </p>
        <div className="mt-3 flex items-baseline justify-between border-y border-border py-1.5">
          <div className="text-xs font-semibold">
            {loading ? <Skeleton className="h-4 w-24" /> : `${leftToAction} left to action`}
          </div>
          <span className="text-[11px] text-muted-foreground">showing top {TOP_N}</span>
        </div>

        <div>
          {allClear ? (
            <div className="py-6 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-success/15 text-success">
                <Check className="size-6" aria-hidden />
              </span>
              <h3 className="mt-3 text-base font-semibold">All clear 🎉</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {cleared > 0
                  ? `You cleared ${cleared} ${cleared === 1 ? "item" : "items"}. Come back tomorrow to keep your streak alive.`
                  : "Nothing urgent right now — great work!"}
              </p>
            </div>
          ) : (
            <PriorityList
              loading={loading}
              quickStart={quickStart}
              aiCount={aiCount}
              items={visibleItems}
              onActed={(id) => setTouched((current) => new Set(current).add(id))}
              onFailed={breakRun}
            />
          )}
        </div>
      </section>

      {/* Everything else. */}
      {!showEverything ? (
        <button
          type="button"
          onClick={() => setShowEverything(true)}
          aria-expanded={false}
          aria-controls="quick-actions-everything-else"
          className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm outline-none transition-colors hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
            Show everything else · {cards.visibleCount} {cards.visibleCount === 1 ? "card" : "cards"}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Opens on its own once you&apos;ve cleared your top 5
          </span>
        </button>
      ) : (
        <section id="quick-actions-everything-else" className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5" data-usertour="quick-actions-everything">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Everything else</h2>
            <button
              type="button"
              onClick={() => setShowEverything(false)}
              aria-expanded
              aria-controls="quick-actions-everything-else"
              className="flex items-center gap-1 rounded-md text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronUp className="size-4" aria-hidden />
              Hide
            </button>
          </div>
          {grid.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
              Nothing on home — add a card from Customise.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">{grid}</div>
          )}
        </section>
      )}
    </div>
  );
}
