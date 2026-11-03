"use client";

import * as React from "react";
import Link from "next/link";
import {
  BellOff,
  Check,
  ChevronDown,
  CircleSlash,
  Eye,
  Flame,
  LayoutGrid,
  ListChecks,
  MoreHorizontal,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FilterPills } from "@/components/ui/filter-pills";
import { Separator } from "@/components/ui/separator";
import { STAT_TONES } from "@/components/ui/stat-cards";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ActionRowShell,
  ROW_ACTION,
  ROW_ACTION_TINTED,
  ROW_AMOUNT,
  ROW_MENU,
} from "@/components/actions/action-row";
import { FirstRunPanel } from "@/components/actions/first-run-panel";
import { PageHeader } from "@/components/layout/page-header";
import { useCelebrationConfetti } from "@/components/onboarding/use-celebration-confetti";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { money } from "@/lib/dashboard-data";
import { toIsoDate } from "@/lib/invoices";
import {
  ACTION_TYPES,
  ACTION_URGENCIES,
  actionCounts,
  actionGroups,
  actionItems,
  type ActionItem,
  type ActionType,
  type ActionUrgency,
} from "@/lib/quick-actions";
import { useWelcomeHydrated } from "@/lib/use-welcome-hydrated";
import { cn } from "@/lib/utils";
import { activeBusiness, useBusinessesStore } from "@/stores/businesses";
import { useExpensesStore } from "@/stores/expenses";
import { useInvoicesStore } from "@/stores/invoices";
import { useQuotesStore } from "@/stores/quotes";
import { useTransactionsStore } from "@/stores/transactions";
import { useWelcomeStore } from "@/stores/welcome";

/*
 * Two tabs, and the reason is the page's two audiences.
 *
 * This route used to hold a five-step setup wizard beside the work queue, and
 * the wizard was dropped when first run moved into the overlay every account
 * now walks before it reaches the app. What that left behind was a queue
 * derived entirely from invoices, quotes, bills and bank rows — which is a
 * blank page for an account that has none of them, on the one screen a new
 * account is most likely to open looking for what to do.
 *
 * New is that answer, and it's route-specific rather than a generic checklist:
 * see `FirstRunPanel`. Data is the queue, unchanged — same strip, same five,
 * same everything-else, moved inside a tab and not otherwise touched.
 */

/** The two tabs. `data` is the queue this page has always been. */
type QuickActionsTab = "new" | "data";

const QUICK_ACTIONS_TIP =
  "Everything across your business that needs a decision or a keystroke, derived live from your invoices, quotes, bills and bank feed. Clear one and it leaves the list.";

/** "All" isn't a band — it's the absence of one, so it lives with the chips. */
const URGENCY_FILTERS = ["All", ...ACTION_URGENCIES] as const;
type UrgencyFilter = (typeof URGENCY_FILTERS)[number];

/*
 * No "All" on the type row. It was a second pill reading "All 12" directly under
 * the first one, which made two different controls look like one repeated —
 * and it isn't needed: every type on *is* all of them, and turning the last one
 * back on is the same gesture as pressing All would have been.
 */

/**
 * A type's colour, worn by both its icon tile and its badge.
 *
 * Colour here says what kind of item it is, never how urgent — urgency is
 * already carried three ways over, by the group it sits under, the chip that
 * filters to it, and the colour of its amount. Spending the type's channel on
 * urgency too would leave no way to tell an invoice from a bank row at a glance,
 * which is the whole job of a scannable list.
 *
 * One map for the tile and the badge, so a row can't say one thing in its icon
 * and another in its label. Tones come from `STAT_TONES`, so these are the same
 * colours these types wear everywhere else in the product; money out takes the
 * warm accent, as it does throughout.
 */
const TYPE_TONE: Record<ActionType, string> = {
  Invoices: STAT_TONES.primary,
  "Bank feed": STAT_TONES.accent,
  Expenses: "bg-warm text-warm-foreground",
  Time: STAT_TONES.warning,
  Quotes: STAT_TONES.success,
  Other: "bg-muted text-muted-foreground",
};

/**
 * The amount's colour, by band — in the everything-else list only.
 *
 * The platform's usual rule is that colour goes on an icon or a status word and
 * never on a figure. This list is the exception on purpose: every row here is
 * money waiting on a decision, and how late it is *is* the thing being reported.
 * Kept to the three bands so it can't say anything the group heading doesn't.
 *
 * The urgent five opt out: five rows all shouting in red is five rows with no
 * hierarchy between them, so up there the figure is plain and the lateness moves
 * onto the meta line, where the words can be specific about it.
 */
const AMOUNT_TONE: Record<ActionUrgency, string> = {
  Overdue: "text-destructive",
  "This week": "text-warning",
  Later: "text-muted-foreground",
};

/**
 * The urgent amount, plain.
 *
 * The hex is the design system's ink for a figure that carries no status. Paired
 * with the token in dark mode, where a near-black figure on a dark card would be
 * the one unreadable thing in the row.
 */
const URGENT_AMOUNT_TONE = "text-[#0F1117] dark:text-foreground";

/**
 * The streak's flame, as one set of classes.
 *
 * Amber fill and an amber glow at 40%, written out as literals because a class
 * built by interpolation is a class Tailwind never sees. The glow is a
 * `drop-shadow` rather than a `box-shadow` so it follows the flame's outline
 * instead of haloing a square nobody drew.
 */
const FLAME_TONE =
  "fill-[#F59E0B] text-[#F59E0B] drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]";

/** How long the row's exit runs — kept in step with `animate-clear`. */
const CLEAR_MS = 200;

/** How many rows fit in "five minutes". */
const URGENT_COUNT = 5;

/*
 * The goal ring's geometry.
 *
 * Stroke width comes out of the box rather than off it, so the radius is inset
 * by half the stroke — otherwise a 6px stroke on a 64px circle is clipped by
 * 3px all the way round. The dash length is that circle's circumference, which
 * is what makes `strokeDashoffset` a fraction of the arc rather than a number of
 * pixels nobody can reason about.
 */
const RING_SIZE = 64;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * The gradient the arc is painted with, and its `defs` id.
 *
 * Indigo into teal: the brand's own two, which is what stops a progress ring
 * from being the one gradient on the platform that came from nowhere. A named
 * constant because the `stroke` reference and the `<linearGradient>` have to
 * agree, and an id typed twice is an arc that silently paints with none.
 */
const RING_GRADIENT_ID = "quick-actions-goal-ring";
const RING_GRADIENT_FROM = "#4D4DFE";
const RING_GRADIENT_TO = "#14B8A6";

/**
 * How long the status copy takes to swap.
 *
 * Short, because the words are a reaction to a click — and split either side of
 * the swap, so the old line is gone before the new one arrives rather than the
 * two dissolving through each other.
 */
const COPY_FADE_MS = 150;

/**
 * Days in a row with the list cleared.
 *
 * TODO: needs a persistence layer — a streak is a fact about yesterday, and
 * nothing on the client knows what happened yesterday. Constant until it does,
 * and it only moves when the list is cleared in this session.
 */
const STREAK_DAYS = 1;

/** The two lines beside the ring, and the headline's colour if it takes one. */
type GoalCopy = { headline: string; subline: string; tone?: string };

/**
 * What the strip says, by how far through the goal you are.
 *
 * Forward-looking at every tier and scolding at none: the ladder never reports
 * what hasn't been done, only what the next one gets you. That's the whole
 * reason the ring counts up rather than down — a strip that opens empty and
 * fills as you work can afford to be encouraging, where one that opens full and
 * drains is telling you off by arithmetic.
 *
 * Ordered by precedence rather than by tier, because the tiers overlap: one
 * short of a goal of two is also the first one cleared, and "almost there" is
 * the more useful of the two things to say.
 */
function goalCopy(cleared: number, goal: number): GoalCopy {
  /*
   * No goal to set, because there was nothing to do — which is neither a win
   * nor a nudge, so it's said plainly. Its own tier because every other line
   * here compares against a goal, and "goal smashed" for work nobody did is
   * the one thing this strip must never say.
   */
  if (goal === 0)
    return {
      headline: "All clear",
      subline: "Nothing waiting on you right now",
      tone: "text-success",
    };
  if (cleared >= goal)
    return {
      headline: "Goal smashed!",
      subline: "Every extra one is a bonus",
      tone: "text-success",
    };
  if (cleared === 0)
    return {
      headline: "Ready when you are",
      subline: "Clear one to get the ball rolling",
    };
  if (cleared === goal - 1)
    return { headline: "Almost there", subline: "1 more to smash your goal" };
  if (cleared === 1)
    return { headline: "Nice start", subline: "You're moving — keep going" };
  return {
    headline: "On a roll",
    subline: `${goal - cleared} more to hit today's goal`,
  };
}

/**
 * The burst.
 *
 * A component rather than a call, because the confetti helper is a hook that
 * fires on mount — so the moment is expressed by mounting it. Mounted once and
 * left mounted, which is also the guard: two moments can land on the same
 * clear, and a single boolean flipping true once is a single burst. Rendered
 * only when motion is welcome; the hook checks the preference too, and this
 * keeps `canvas-confetti` out of the bundle path for anyone who's asked for
 * less.
 */
function ClearedCelebration() {
  useCelebrationConfetti();
  return null;
}

/**
 * Quick Actions.
 *
 * Three tiers, narrowest first: where the business stands, the five things worth
 * doing right now, and everything else behind a collapsible. The five are the
 * page — a list of forty is a list nobody starts, and the strip above them is
 * there so starting has a number attached to it.
 *
 * The remainder keeps the flat list under three headings rather than a section
 * per type: the work arrives mixed, and grouping by type would mean checking six
 * places to find out whether anything is late.
 */
export function QuickActionsScreen() {
  const invoices = useInvoicesStore((state) => state.invoices);
  const expenses = useExpensesStore((state) => state.expenses);
  const quotes = useQuotesStore((state) => state.quotes);
  const transactions = useTransactionsStore((state) => state.transactions);

  const [urgency, setUrgency] = React.useState<UrgencyFilter>("All");
  /**
   * The types showing, all of them to begin with.
   *
   * A list of what's on rather than of what's off, because that's what the
   * toggle group's value is — and because "every type" as an explicit list is
   * what makes turning one off a one-item change instead of a special case.
   */
  const [types, setTypes] = React.useState<ActionType[]>([...ACTION_TYPES]);

  /**
   * Items dealt with in this session, and the ones mid-exit.
   *
   * Local rather than written back to the stores: clearing a row here says "I've
   * handled this", which isn't the same as marking an invoice paid — and pushing
   * a guess into the store would have the Dashboard report it as done too.
   * Ephemeral for the same reason: a reload asks the stores again and gets the
   * truth.
   */
  const [cleared, setCleared] = React.useState<string[]>([]);
  const [exiting, setExiting] = React.useState<string[]>([]);

  /**
   * Whether the everything-else section is open.
   *
   * State rather than the disclosure's own memory, because two things open it:
   * pressing the bar, and clearing the last of the urgent set. Collapsed to
   * begin with — the point of the five above it is that they're the only five
   * you have to look at.
   */
  const [showEverything, setShowEverything] = React.useState(false);

  /** Moves once, when the list is cleared. See `STREAK_DAYS`. */
  const [streak, setStreak] = React.useState(STREAK_DAYS);

  /*
   * Two moments, latched separately, and one burst between them.
   *
   * They can land on the same clear — the fifth of five is often the fifth
   * against the goal as well — so neither fires confetti itself. Each records
   * that it happened and does its own side effect, and the burst is mounted on
   * either being true, which is what makes a double burst unreachable rather
   * than merely unlikely.
   */
  const [listCleared, setListCleared] = React.useState(false);
  const [goalReached, setGoalReached] = React.useState(false);
  const celebrated = listCleared || goalReached;

  /*
   * Read in JS rather than left to the stylesheet because two of the things it
   * gates aren't CSS: the delay `clear` waits out, and whether the confetti
   * canvas is mounted at all.
   */
  const reduced = usePrefersReducedMotion();

  /**
   * The business the figures belong to, named in the subtitle.
   *
   * From the switcher's store rather than the settings profile, so choosing a
   * different business at the top of the rail renames this page too — which is
   * the whole of what the selection can currently affect. The rows themselves
   * are not yet scoped; that's the follow-up.
   *
   * Gated on mount, because the store defers rehydration: reading it straight
   * out would render the seeded first business on the server and the stored one
   * in the browser, which is a text mismatch React warns about. Until then the
   * subtitle says "your business", which is true of whichever it turns out to be.
   */
  const businesses = useBusinessesStore((state) => state.businesses);
  const activeId = useBusinessesStore((state) => state.activeId);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const scope = mounted
    ? (activeBusiness({ businesses, activeId })?.name ?? "your business")
    : "your business";

  const today = toIsoDate(new Date());
  const all = actionItems({
    invoices,
    quotes,
    expenses,
    transactions,
    today,
  }).filter((item) => !cleared.includes(item.id));

  /*
   * The whole list, worst first.
   *
   * Ranked here rather than through `keyActions`, which drops bank-feed rows
   * because the Dashboard's five slots are for documents. This page is the one
   * surface that ranks across everything, so a transaction that has been sitting
   * uncoded for three weeks can beat an invoice that went out yesterday.
   *
   * Score, then amount. Score is the shared scale across types; two items on the
   * same score are the same kind of problem at the same age, and the larger one
   * is the one worth the keystroke first.
   */
  const ranked = [...all].sort(
    (a, b) => b.score - a.score || b.amount - a.amount,
  );

  /*
   * The split. The five are what the page is about; the rest is what the
   * collapsible holds.
   *
   * Both derived from `ranked` rather than held in state, which is what makes
   * promotion free: the moment a cleared id lands in `cleared` the item leaves
   * `all`, the sixth becomes the fifth, and the set is five again. Nothing has to
   * remember which five it was showing a second ago.
   */
  const urgent = ranked.slice(0, URGENT_COUNT);
  const rest = ranked.slice(URGENT_COUNT);

  /* ---------------------------------------------------------------- *
   * Today's goal, and the strip's figures
   * ---------------------------------------------------------------- */

  const remaining = all.length;
  const clearedThisSession = cleared.length;

  /**
   * Today's goal: five, or the whole list if it's shorter than five.
   *
   * `clearedThisSession + remaining` is the list as it stood when the session
   * opened — an id leaving `all` is an id arriving in `cleared`, so the sum
   * doesn't move. That invariance is the point: a goal derived from it is fixed
   * for the session, so the denominator can't creep up as work is done, which is
   * the failure that makes most progress rings feel dishonest.
   */
  const dailyGoal = Math.min(URGENT_COUNT, clearedThisSession + remaining);

  /*
   * The ring counts up towards the goal rather than down through the work.
   *
   * Same numbers, opposite feeling: filling as you go is a reward for the click
   * you just made, where an emptying ring opens full and spends the session
   * shrinking. Capped, because clearing past the goal is a bonus and not 140%
   * of an arc.
   */
  const progress =
    dailyGoal === 0 ? 1 : Math.min(clearedThisSession / dailyGoal, 1);

  /*
   * Goal met, twice over.
   *
   * `goalMet` is what the ring and the centre draw, and it's true of an empty
   * list too — nothing to do is drawn as done, which is honest. `goalEarned`
   * adds "and there was something to do", and it's the one the pop and the
   * burst hang off, so arriving at an empty list is never congratulated.
   */
  const goalMet = clearedThisSession >= dailyGoal;
  const goalEarned = dailyGoal > 0 && goalMet;

  /*
   * The all-clear moment: the last of the urgent set gone.
   *
   * Gated on something having been cleared, so someone arriving at an already
   * empty list gets the green ring without a burst of confetti for work they
   * didn't do here. Latched rather than compared against a previous count, which
   * is what keeps it a moment instead of a loop.
   */
  React.useEffect(() => {
    if (listCleared || urgent.length > 0 || clearedThisSession === 0) return;
    setListCleared(true);
    setStreak((current) => current + 1);
    setShowEverything(true);
  }, [listCleared, urgent.length, clearedThisSession]);

  /*
   * The goal moment: the ring closing.
   *
   * Separate from the one above because it lands earlier — five of forty is a
   * goal met with thirty-five still on the list — and because all it owes the
   * page is the pop. The streak and the disclosure belong to clearing the list,
   * not to hitting the goal.
   */
  React.useEffect(() => {
    if (goalReached || !goalEarned) return;
    setGoalReached(true);
  }, [goalReached, goalEarned]);

  /*
   * The status copy, and the crossfade between tiers.
   *
   * Held one beat behind the numbers rather than swapped under a fading box:
   * fading a line that has already changed shows the new words, hides them, and
   * shows them again. Memoised so the tier is compared by identity, which is
   * what lets the effect tell "new tier" from "same tier, re-rendered".
   */
  const copy = React.useMemo(
    () => goalCopy(clearedThisSession, dailyGoal),
    [clearedThisSession, dailyGoal],
  );
  const [shownCopy, setShownCopy] = React.useState(copy);
  const [copyVisible, setCopyVisible] = React.useState(true);

  React.useEffect(() => {
    if (copy === shownCopy) return;
    // Same tier, fresher figure — "3 more" to "2 more" is a number ticking
    // over, and a crossfade for it would announce every clear twice.
    if (copy.headline === shownCopy.headline) {
      setShownCopy(copy);
      return;
    }
    if (reduced) {
      setShownCopy(copy);
      return;
    }
    setCopyVisible(false);
    const timer = window.setTimeout(() => {
      setShownCopy(copy);
      setCopyVisible(true);
    }, COPY_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [copy, shownCopy, reduced]);

  /*
   * Counts describe what each chip would leave from the *other* axis's current
   * selection, so the numbers add up to what you'd actually see rather than to
   * the whole list. Filtering by Overdue and then reading the type counts is a
   * question about overdue items.
   *
   * All three read `rest`, not `all`: the filters belong to the everything-else
   * section, and a chip counting the urgent five would offer to filter rows that
   * aren't in the list underneath it.
   */
  const byType = rest.filter((item) => types.includes(item.type));
  const byUrgency =
    urgency === "All" ? rest : rest.filter((item) => item.urgency === urgency);
  const shown = byType.filter(
    (item) => urgency === "All" || item.urgency === urgency,
  );

  /*
   * All three bands, always — `actionGroups` keeps the empty ones. Stacked with
   * headings while the urgency filter is off; once a band is chosen the heading
   * would only repeat the chip that's already lit, so the rows stand alone.
   */
  const groups = actionGroups(shown);
  const stacked = urgency === "All";
  const typeCounts = actionCounts(byUrgency, ACTION_TYPES, (item) => item.type);

  /* ---------------------------------------------------------------- *
   * Which tab is up
   * ---------------------------------------------------------------- */

  /**
   * New until first value has been had, then Data.
   *
   * Settled once, after the store rehydrates, and never again — so a landing
   * default can't yank the page out from under someone who has since pressed
   * the other tab. Before hydration the answer is New, which is both the safe
   * default for the account this tab exists for and the same value the server
   * rendered.
   */
  const welcomeHydrated = useWelcomeHydrated();
  const firstValueDone = useWelcomeStore((state) => state.firstValueDone);
  const [tab, setTab] = React.useState<QuickActionsTab>("new");
  const landed = React.useRef(false);

  React.useEffect(() => {
    if (!welcomeHydrated || landed.current) return;
    landed.current = true;
    if (firstValueDone) setTab("data");
  }, [welcomeHydrated, firstValueDone]);

  const clear = (item: ActionItem) => {
    setExiting((current) => [...current, item.id]);
    toast.success(`${item.title} cleared`, {
      description: `${item.cta} — off your list.`,
    });
    // Unmounted after the exit rather than on the click, so the animation has
    // something to animate — and the promotion lands with it, so the sixth row
    // arrives as the fifth leaves rather than while it's still sliding. The id
    // reaches `cleared` either way, so reduced motion just means it goes at once.
    window.setTimeout(
      () => {
        setCleared((current) => [...current, item.id]);
        setExiting((current) => current.filter((id) => id !== item.id));
      },
      reduced ? 0 : CLEAR_MS,
    );
  };

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={ListChecks}
        title="Quick Actions"
        titleTip={QUICK_ACTIONS_TIP}
        description={
          all.length === 0
            ? `Nothing waiting on you in ${scope}.`
            : `${all.length} ${all.length === 1 ? "item" : "items"} in ${scope} — clear them one at a time.`
        }
      />

      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next as QuickActionsTab)}
        className="space-y-6"
      >
        <TabsList>
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>

        {/* The route-specific first run. Everything it renders comes from the
            resolved journey — see `FirstRunPanel`. */}
        <TabsContent value="new" className="space-y-6">
          <FirstRunPanel />
        </TabsContent>

        {/* The queue, exactly as it was before there were tabs. */}
        <TabsContent value="data" className="space-y-6">
          {/* Mounted for the moment, unmounted for anyone who's asked for less
              motion — see `ClearedCelebration`. */}
          {celebrated && !reduced ? <ClearedCelebration /> : null}

          {/*
            Today's goal, and two figures for context.

            The ring is the strip: a small, finishable target that fills as the
            list is worked, which is why the number inside it counts up. What's
            left and the streak sit to the right of a divider because they're
            the background to that, not a second thing to act on.
          */}
          <div className="flex items-center gap-6 rounded-[14px] border border-border bg-card p-5 shadow-sm">
            <div
              className={cn(
                "relative shrink-0",
                // Pops once, when the arc closes. The class arrives with
                // `goalReached` and stays, and a finite animation runs on
                // arrival — so it plays on the clear that earned it and not
                // again on the renders after.
                goalReached && !reduced && "animate-goal-pop",
              )}
              style={{ width: RING_SIZE, height: RING_SIZE }}
            >
              <svg
                width={RING_SIZE}
                height={RING_SIZE}
                viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                role="presentation"
                aria-hidden
              >
                <defs>
                  {/* Corner to corner rather than left to right, so the sweep
                      of the arc crosses the gradient instead of running along
                      one band of it. */}
                  <linearGradient
                    id={RING_GRADIENT_ID}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor={RING_GRADIENT_FROM} />
                    <stop offset="100%" stopColor={RING_GRADIENT_TO} />
                  </linearGradient>
                </defs>

                {/* The track: the shape of the whole goal, always drawn, so the
                    fill is read as a proportion rather than as a lone arc. */}
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  fill="none"
                  strokeWidth={RING_STROKE}
                  className="stroke-border"
                />
                {/* Rotated so the arc starts at twelve o'clock, which is where
                    progress is read from. Brand gradient on the way up and
                    solid green at the top, so the colour change is the news
                    rather than a shade of the same thing. */}
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  fill="none"
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                  stroke={
                    goalMet
                      ? "hsl(var(--success))"
                      : `url(#${RING_GRADIENT_ID})`
                  }
                  strokeDasharray={RING_LENGTH}
                  strokeDashoffset={RING_LENGTH * (1 - progress)}
                  className={cn(
                    "origin-center -rotate-90",
                    !reduced &&
                      "transition-[stroke-dashoffset] duration-500 ease-out",
                  )}
                />
              </svg>
              {/* In the middle of the ring, and hidden from screen readers —
                  the block beside it says the same thing in words. */}
              <span
                className="absolute inset-0 grid place-items-center"
                aria-hidden
              >
                {goalMet ? (
                  <Check className="size-6 text-success" />
                ) : (
                  <span className="flex items-baseline gap-px">
                    <span className="text-lg font-semibold tabular">
                      <CountUp value={clearedThisSession} />
                    </span>
                    <span className="text-xs text-muted-foreground tabular">
                      /{dailyGoal}
                    </span>
                  </span>
                )}
              </span>
            </div>

            {/*
              The encouragement. Held one render behind the figures so the tier
              change can fade out and back in rather than swapping mid-word —
              see the effect that drives `shownCopy`.
            */}
            <div
              className={cn(
                "min-w-0",
                !reduced && "transition-opacity duration-150",
                copyVisible ? "opacity-100" : "opacity-0",
              )}
            >
              <p className={cn("text-sm font-semibold", shownCopy.tone)}>
                {shownCopy.headline}
              </p>
              <p className="text-xs text-muted-foreground">
                {shownCopy.subline}
              </p>
            </div>

            <Separator orientation="vertical" className="h-10" />

            <div className="min-w-0">
              <p className="text-sm font-medium tabular">
                <CountUp value={remaining} />
              </p>
              <p className="text-xs text-muted-foreground">items awaiting</p>
            </div>

            <Separator orientation="vertical" className="h-10" />

            <div className="min-w-0">
              {/*
                The flame beside the count rather than above it, so this block
                is two lines like the one next to it — a third line here would
                make the smallest thing in the strip the tallest.
              */}
              <p className="flex items-center gap-1.5 text-sm font-medium tabular">
                <Flame
                  className={cn(
                    "size-4 shrink-0",
                    FLAME_TONE,
                    // Breathes rather than blinks: three and a bit seconds is
                    // slow enough to read as an ember and not as an alert.
                    !reduced && "animate-ember",
                  )}
                  aria-hidden
                />
                {streak}-day streak
              </p>
              <p className="text-xs text-muted-foreground">keep it alive</p>
            </div>
          </div>

          {/*
            The five.

            One card rather than five, so the set reads as a single sitting with
            an end to it. The heading names the commitment — five minutes — and
            the line under it explains the one behaviour that isn't obvious: the
            list refills itself from underneath.
          */}
          <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Target className="size-4 shrink-0 text-primary" aria-hidden />
                <h2 className="text-base font-semibold">
                  If you&apos;ve got 5 minutes
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Your 5 most urgent — clear one and the next moves up
              </p>
            </div>

            <Separator className="my-4" />

            {/* The count is the whole list, not the five: it's what ticks down
                as rows are cleared, which is what makes the refill legible
                rather than looking like nothing happened. */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium tabular">
                <CountUp value={remaining} /> left to action
              </p>
              <p className="text-xs text-muted-foreground">showing top 5</p>
            </div>

            {urgent.length === 0 ? (
              /*
                Nothing on the list at all, which is a different thing from
                nothing matching the filters — so it gets its own state and its
                own way out. The chips below are no help here, so this offers the
                Dashboard instead of suggesting a chip to press.
              */
              <Empty>
                <EmptyMedia className="bg-success/10 text-success">
                  <Check aria-hidden />
                </EmptyMedia>
                <div className="space-y-1">
                  <EmptyTitle>You&apos;re all clear</EmptyTitle>
                  <EmptyDescription>
                    Nothing needs your attention right now.
                  </EmptyDescription>
                </div>
                <Button variant="outline" asChild className="mt-4">
                  <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
              </Empty>
            ) : (
              <ul className="divide-y divide-border/70">
                {urgent.map((item) => (
                  <li
                    key={item.id}
                    /* `group` so the row's hover reaches the button inside it —
                       the whole row is the target, the button is the affordance. */
                    className={cn(
                      "group",
                      exiting.includes(item.id) &&
                        "pointer-events-none motion-safe:animate-clear",
                    )}
                  >
                    <ActionRow item={item} urgent onClear={() => clear(item)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/*
            Everything else, behind one press.

            Closed to begin with, because the five above it are the point; opened
            by the bar or by clearing the five, which is what the note on the
            right is promising. A placeholder for the category cards planned for
            this space — what's inside for now is the list as it was.
          */}
          <button
            type="button"
            onClick={() => setShowEverything((open) => !open)}
            aria-expanded={showEverything}
            aria-controls="quick-actions-everything-else"
            className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-border bg-card p-4 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground motion-safe:transition-transform",
                  showEverything && "rotate-180",
                )}
                aria-hidden
              />
              Show everything else · {rest.length}{" "}
              {rest.length === 1 ? "card" : "cards"}
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Opens on its own once you&apos;ve cleared your top 5
            </span>
          </button>

          {showEverything ? (
            <div id="quick-actions-everything-else" className="space-y-6">
              {/*
                One zone, two rows, two different controls — and they're
                different components rather than the same one styled twice,
                which is what stops them reading as a repeat. The top row is a
                single choice, so it's the platform's pills with the solid
                indigo active state. The bottom row is a set of switches, so
                it's a multiple ToggleGroup with the tinted outline
                `data-[state=on]` treatment the format toggles use.

                No search box in here: the Cmd+K palette in the top bar already
                searches across the product and sits directly above this
                content. A second search that only covered this page would be
                the narrower of two boxes an inch apart.
              */}
              <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    Sort by urgency:
                  </span>
                  <FilterPills
                    label="Show actions by urgency"
                    options={URGENCY_FILTERS}
                    value={urgency}
                    onChange={setUrgency}
                    counts={{
                      All: byType.length,
                      ...actionCounts(
                        byType,
                        ACTION_URGENCIES,
                        (item) => item.urgency,
                      ),
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    Filter by type:
                  </span>
                  <ToggleGroup
                    type="multiple"
                    value={types}
                    onValueChange={(next) => setTypes(next as ActionType[])}
                    aria-label="Filter actions by type"
                    className="flex-wrap justify-start gap-2"
                  >
                    {ACTION_TYPES.map((option) => {
                      const count = typeCounts[option] ?? 0;
                      const on = types.includes(option);

                      return (
                        <ToggleGroupItem
                          key={option}
                          value={option}
                          variant="outline"
                          aria-label={`${on ? "Hide" : "Show"} ${option}`}
                          className={cn(
                            "h-8 min-w-0 gap-1.5 rounded-full px-3.5 text-sm font-normal",
                            "text-muted-foreground",
                            "data-[state=on]:border-primary/30 data-[state=on]:bg-primary/10 data-[state=on]:font-medium data-[state=on]:text-primary",
                          )}
                        >
                          {option}
                          <span className="text-xs tabular opacity-70">
                            {count}
                          </span>
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </div>
              </div>

              {rest.length === 0 ? (
                /*
                  Nothing behind the five, which is a different thing from
                  nothing matching the filters — the chips above are no help
                  here, so this says so plainly rather than suggesting a chip
                  to press.
                */
                <Empty>
                  <EmptyMedia className="bg-muted text-muted-foreground">
                    <LayoutGrid aria-hidden />
                  </EmptyMedia>
                  <div className="space-y-1">
                    <EmptyTitle>Nothing else waiting</EmptyTitle>
                    <EmptyDescription>
                      {remaining === 0
                        ? "You've cleared the lot."
                        : "Your whole list is in the five above."}
                    </EmptyDescription>
                  </div>
                </Empty>
              ) : shown.length === 0 ? (
                <Empty>
                  <EmptyMedia className="bg-success/10 text-success">
                    <Check aria-hidden />
                  </EmptyMedia>
                  <div className="space-y-1">
                    <EmptyTitle>You&apos;re all caught up</EmptyTitle>
                    <EmptyDescription>
                      {types.length === 0
                        ? "Every type is switched off. Turn one back on to see what's waiting."
                        : "Nothing matches those filters — the rest of your list is under the other chips."}
                    </EmptyDescription>
                  </div>
                </Empty>
              ) : stacked ? (
                /*
                 * One continuous list. The headings are siblings of the cards rather
                 * than children, because an `overflow-hidden` ancestor becomes the
                 * scrollport a sticky element sticks inside — and a box that can't
                 * scroll is a box a sticky heading never leaves.
                 */
                <div className="space-y-5">
                  {groups.map((group) => (
                    <section key={group.urgency}>
                      <div className="sticky top-14 z-10 flex items-center gap-2 border-b border-border bg-background/85 px-1 py-2 backdrop-blur">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {group.urgency}
                        </h2>
                        <span
                          className="text-xs text-muted-foreground"
                          aria-hidden
                        >
                          ·
                        </span>
                        <span className="text-xs text-muted-foreground tabular">
                          {group.items.length}
                        </span>
                      </div>

                      <div className="mt-2">
                        {group.items.length === 0 ? (
                          /* Said rather than hidden: "nothing overdue" is one of the
                     more useful things this page can tell someone, and a band
                     that vanishes when it empties can't tell them. */
                          <p className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                            Nothing here
                          </p>
                        ) : (
                          <ActionRows
                            items={group.items}
                            exiting={exiting}
                            onClear={clear}
                          />
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                /* The chosen band's rows, from the same grouping — so "oldest first"
           stays one sort rather than one here and another up there. */
                <ActionRows
                  items={
                    groups.find((group) => group.urgency === urgency)?.items ??
                    []
                  }
                  exiting={exiting}
                  onClear={clear}
                />
              )}
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * A band of rows.
 *
 * Its own component because both arrangements draw the same card — stacked
 * under headings, or alone once a band has been chosen — and a second copy of
 * the card is a second place for the dividers and the exit animation to drift.
 */
function ActionRows({
  items,
  exiting,
  onClear,
}: {
  items: ActionItem[];
  /** The ids mid-exit, which keep their row mounted until the slide finishes. */
  exiting: string[];
  onClear: (item: ActionItem) => void;
}) {
  return (
    <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            exiting.includes(item.id) &&
              "pointer-events-none motion-safe:animate-clear",
          )}
        >
          <ActionRow item={item} onClear={() => onClear(item)} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One job, and the button that finishes it.
 *
 * Every type gets the same anatomy — tile, title, meta, amount, action, menu —
 * so a row is read the same way whatever it is. The row isn't a link: it holds
 * two controls, and a link wrapping buttons is both invalid and ambiguous about
 * what a click means. Opening the record is View, in the menu.
 */
function ActionRow({
  item,
  urgent = false,
  onClear,
}: {
  item: ActionItem;
  /**
   * In the top five.
   *
   * Changes two things and nothing else: the figure goes plain and the lateness
   * moves to the meta line, and the button rests quiet until the row is hovered.
   * Same anatomy either way, so a row is still read the same way in both places.
   */
  urgent?: boolean;
  onClear: () => void;
}) {
  const late = item.urgency === "Overdue";

  return (
    <ActionRowShell
      icon={item.icon}
      iconTone={TYPE_TONE[item.type]}
      // Flush inside the urgent card, whose own p-6 is the inset — a row with
      // its own padding on top of that would sit in from the heading above it.
      flush={urgent}
      title={item.title}
      meta={
        <>
          <Badge
            // `outline` is the only variant that brings no colour of its own,
            // so the type's tone is the whole treatment. Border transparent so
            // it reads as a soft chip rather than a bordered one.
            variant="outline"
            className={cn(
              "shrink-0 rounded-full border-transparent px-2 py-0 text-[11px] font-medium",
              TYPE_TONE[item.type],
            )}
          >
            {item.typeLabel}
          </Badge>
          {/* The type word is the badge now, so what's left is where the item
              stands and what its clock says — and in the urgent five it's also
              where the red lives, since the figure up there is plain. */}
          <span
            className={cn(
              "truncate text-xs tabular",
              urgent && late ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {item.status} · {item.timing}
          </span>
        </>
      }
      amount={
        <p
          className={cn(
            ROW_AMOUNT,
            "text-sm font-semibold",
            urgent ? URGENT_AMOUNT_TONE : AMOUNT_TONE[item.urgency],
          )}
        >
          {money(item.amount)}
        </p>
      }
      action={
        /*
          One primary per row and it does the thing the row is for. It clears
          rather than navigates because this is a list you work through — the
          record is a menu item away for the times you need to look first.

          In the urgent five it's tinted at rest and solid once the row is
          hovered or something inside it is focused — see `ROW_ACTION_TINTED`.
        */
        <Button
          size="sm"
          variant={urgent ? "ghost" : "default"}
          className={cn(ROW_ACTION, urgent && ROW_ACTION_TINTED)}
          onClick={onClear}
        >
          {item.cta}
        </Button>
      }
      overflow={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(ROW_MENU, "text-muted-foreground")}
              aria-label={`More actions for ${item.title}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={onClear}>
              <BellOff className="text-muted-foreground" />
              Snooze
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onClear}>
              <CircleSlash className="text-muted-foreground" />
              Dismiss
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* The record itself, and wherever the rest of its kind live. */}
            <DropdownMenuItem asChild>
              <Link href={item.href}>
                <Eye className="text-muted-foreground" />
                View
              </Link>
            </DropdownMenuItem>
            {item.menu.map((entry) => (
              <DropdownMenuItem key={entry.label} asChild>
                <Link href={entry.href}>{entry.label}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={onClear}
            >
              <Trash2 className="text-destructive" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
}
