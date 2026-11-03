"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Target, X } from "lucide-react";
import { useAtomValue } from "jotai";
import { differenceInCalendarDays, isSameDay, parseISO } from "date-fns";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { track } from "@/lib/analytics";
import { firstRunOverlayOpenAtom } from "@/lib/atoms";
import {
  FALLBACK_JOURNEY,
  journeyById,
  type JourneyAction,
} from "@/lib/journeys";
import { QUICK_ACTIONS_NAV } from "@/lib/nav";
import { SCHEDULE_SUPPORT_URL } from "@/lib/support";
import { useWelcomeHydrated } from "@/lib/use-welcome-hydrated";
import { useWelcomeStore } from "@/stores/welcome";

/**
 * The off-page activation nudge.
 *
 * Quick Actions' New tab tells a new account what to do first, and it works
 * for anyone who opens it. This is for everyone else: the account that
 * finished onboarding, went somewhere else in the product, and hasn't come
 * back to do the one thing that makes any of it worth having.
 *
 * It escalates, because the same nudge on day one and day nine is a nudge that
 * has stopped meaning anything. Three tiers, and the shape changes with the
 * stakes rather than the volume: a strip you can put away for the day, then a
 * modal once a week has gone, then the same modal with the offer of a person
 * instead of a form. What it never does is escalate into shouting — tier three
 * asks less of them than tier one did.
 *
 * Mounted once in the app shell and self-gating: every condition it needs is
 * account state or the route, so no page has to know it exists.
 */

/** Which surface a stalled account gets, by how long they've stalled. */
type Tier = 1 | 2 | 3;

/** Day boundaries. Tier 0 — the first day — is the absence of a tier. */
const TIER_1_FROM = 1;
const TIER_2_FROM = 3;
const TIER_3_FROM = 7;

/**
 * The modal's "not again this session" mark.
 *
 * `sessionStorage`, not the persisted store, and that's the point of it: a
 * session is a session. Closing the modal buys quiet until the tab is closed,
 * not forever — and not a day, which is what the banner's dismissal buys,
 * because the two surfaces cost the reader completely different amounts.
 */
const MODAL_SESSION_KEY = "sole.activation.modal.seen";

/** The route the New tab lives on. See the suppression note below. */
const QUICK_ACTIONS_PATH = QUICK_ACTIONS_NAV.href;

export function ActivationNudge() {
  const pathname = usePathname() ?? "";
  const hydrated = useWelcomeHydrated();
  const overlayOpen = useAtomValue(firstRunOverlayOpenAtom);

  const journeyId = useWelcomeStore((state) => state.journey);
  const firstValueDone = useWelcomeStore((state) => state.firstValueDone);
  const completedAt = useWelcomeStore((state) => state.onboardingCompletedAt);
  const bannerDismissedAt = useWelcomeStore(
    (state) => state.lastBannerDismissedAt,
  );
  const dismissBanner = useWelcomeStore(
    (state) => state.dismissActivationBanner,
  );

  /*
   * Now, captured once on mount rather than read during render.
   *
   * Every tier boundary is a comparison against the clock, and a clock read in
   * render is a different value on the server than in the browser. Taken in an
   * effect it's client-only by construction, and it doesn't move underneath a
   * modal that's already open.
   */
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => setNow(new Date()), []);

  /*
   * Whether this session has already had the modal.
   *
   * Starts true — assume seen — so the first paint can't flash a modal that
   * storage was about to say had already been closed. The effect below
   * corrects it to the real answer a tick later.
   */
  const [modalSeen, setModalSeen] = React.useState(true);
  React.useEffect(() => {
    setModalSeen(window.sessionStorage.getItem(MODAL_SESSION_KEY) === "1");
  }, []);

  const [modalOpen, setModalOpen] = React.useState(false);

  /*
   * A CTA press closes the modal too, and it isn't a dismissal.
   *
   * Radix fires `onOpenChange(false)` either way, so the two have to be told
   * apart by something outside it. Someone who pressed "Send" and then didn't
   * finish hasn't refused the nudge — they tried it.
   */
  const closingViaCta = React.useRef(false);

  /* ---------------------------------------------------------------- *
   * Whether anything shows at all
   * ---------------------------------------------------------------- */

  /*
   * Four reasons to render nothing, and they're checked before the clock
   * because none of them is about time:
   *
   *   - The overlay is up. First run owns the screen while it's open, and a
   *     nudge behind a blocking modal is a nudge nobody can reach anyway.
   *   - First value has happened. The whole surface disappears on the flag,
   *     not on a later visit.
   *   - Onboarding was never finished, or finished before the timestamp
   *     existed. Nothing to measure from — see `onboardingCompletedAt`.
   *   - We're on Quick Actions. The New tab is the nudge's own destination,
   *     and this component can't see which tab is up from out here — the
   *     tab is that screen's local state. Suppressing the route rather than
   *     lifting that state keeps the coupling at zero and costs one banner
   *     on the Data tab, where the New tab is one click away regardless.
   */
  const suppressed =
    !hydrated ||
    overlayOpen ||
    firstValueDone ||
    !completedAt ||
    pathname === QUICK_ACTIONS_PATH ||
    pathname.startsWith(`${QUICK_ACTIONS_PATH}/`);

  const days =
    now && completedAt
      ? differenceInCalendarDays(now, parseISO(completedAt))
      : null;

  const tier: Tier | null =
    suppressed || days === null || days < TIER_1_FROM
      ? null
      : days >= TIER_3_FROM
        ? 3
        : days >= TIER_2_FROM
          ? 2
          : 1;

  /*
   * The banner's dismissal expires with the day rather than after 24 hours.
   * "Not today" is what someone means when they close a strip in the morning,
   * and a rolling window would bring it back mid-afternoon.
   */
  const bannerDismissedToday = Boolean(
    now && bannerDismissedAt && isSameDay(parseISO(bannerDismissedAt), now),
  );

  const bannerVisible = tier === 1 && !bannerDismissedToday;

  /* The modal opens once per session, on the first page that qualifies. */
  React.useEffect(() => {
    if (tier === null || tier < 2 || modalSeen) return;
    window.sessionStorage.setItem(MODAL_SESSION_KEY, "1");
    setModalSeen(true);
    setModalOpen(true);
  }, [tier, modalSeen]);

  /* ---------------------------------------------------------------- *
   * What gets reported
   * ---------------------------------------------------------------- */

  const journey = journeyById(journeyId ?? FALLBACK_JOURNEY);
  const primary = journey.firstRun.primary;

  /** Every event carries the same three, so the funnel can be cut by any. */
  const eventProps = React.useMemo(
    () => ({
      tier: tier ?? 0,
      journey: journey.id,
      daysSinceOnboarding: days ?? 0,
    }),
    [tier, journey.id, days],
  );

  /*
   * Shown once per surface, not once per render.
   *
   * Latched on the tier rather than on a boolean, so a re-render — a route
   * change under the same mount, a store write elsewhere — can't report the
   * same nudge twice. The clock is read once on mount, so a tab left open
   * across midnight keeps yesterday's tier until it's reloaded; that's the
   * right trade for a surface whose whole job is to interrupt rarely.
   */
  const shownFor = React.useRef<Tier | null>(null);
  const showing = bannerVisible ? tier : modalOpen ? tier : null;

  React.useEffect(() => {
    if (showing === null || shownFor.current === showing) return;
    shownFor.current = showing;
    track("activation_nudge_shown", eventProps);
  }, [showing, eventProps]);

  const onDismissBanner = () => {
    track("activation_nudge_dismissed", eventProps);
    dismissBanner(new Date().toISOString());
  };

  const onModalOpenChange = (open: boolean) => {
    setModalOpen(open);
    if (open) return;
    // The X and a click outside both land here; a CTA press is excused by the
    // latch it sets on its way past.
    if (closingViaCta.current) {
      closingViaCta.current = false;
      return;
    }
    track("activation_nudge_dismissed", eventProps);
  };

  const onCta = (cta: "primary" | "book_call") => {
    track("activation_nudge_cta_clicked", { ...eventProps, cta });
    /*
     * First value is deliberately *not* marked here. Someone who presses this
     * and doesn't finish is still stalled, and the nudge has to survive the
     * attempt or it would be one click from silencing itself.
     *
     * TODO: this is the other half of the New tab's TODO — both should learn
     * that first value happened from the editor that saved the document,
     * rather than one guessing from a click and the other not guessing at all.
     */
    closingViaCta.current = true;
    setModalOpen(false);
  };

  if (tier === null) return null;

  if (tier === 1) {
    if (!bannerVisible) return null;
    return (
      <ActivationBanner
        action={primary}
        onCta={onCta}
        onDismiss={onDismissBanner}
      />
    );
  }

  return (
    <ActivationModal
      tier={tier}
      action={primary}
      days={days ?? 0}
      open={modalOpen}
      onOpenChange={onModalOpenChange}
      onCta={onCta}
    />
  );
}

/**
 * Tier 1: a strip at the top of the page.
 *
 * The cheapest thing that can be said — it takes a line, it doesn't block, and
 * it goes away for the day on one press. Built on `Alert` with the content in
 * its own flex row: the primitive positions a direct `svg` child absolutely,
 * which is right for a paragraph with an icon beside it and wrong for a row
 * with controls at the end of it.
 */
function ActivationBanner({
  action,
  onCta,
  onDismiss,
}: {
  action: JourneyAction;
  onCta: (cta: "primary" | "book_call") => void;
  onDismiss: () => void;
}) {
  return (
    // Aligned with the page's own gutter, so it reads as the first block of
    // the page rather than a strip stuck to the chrome above it.
    <div className="px-4 pt-4 md:px-7 md:pt-7">
      <Alert className="bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Target className="size-4 shrink-0 text-primary" aria-hidden />

          <p className="min-w-0 flex-1 text-sm">
            {/* The action's own title, lowercased into the sentence — one copy
                source, so a renamed action can't leave this saying the old
                thing. */}
            You&apos;re yet to {action.label.toLowerCase()}.
          </p>

          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" asChild onClick={() => onCta("primary")}>
              <Link href={action.href}>{action.verb}</Link>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              asChild
              className="text-muted-foreground"
              onClick={() => onCta("book_call")}
            >
              <a
                href={SCHEDULE_SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a call
              </a>
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-muted-foreground"
              onClick={onDismiss}
              aria-label="Dismiss for today"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </Alert>
    </div>
  );
}

/**
 * Tiers 2 and 3: one modal, two hierarchies.
 *
 * The same shell on purpose. By the second week the problem has stopped being
 * that they don't know what to do, so what changes isn't the volume — it's
 * what's being offered. Tier 2 puts the action forward and help beside it;
 * tier 3 puts a person forward and leaves the action there for anyone who
 * would rather just get on with it.
 *
 * Dismissal is whatever Radix already offers — the corner X that
 * `DialogContent` ships and a click outside — because a first-week nudge that
 * had to be answered would be a worse interruption than the one it's chasing.
 */
function ActivationModal({
  tier,
  action,
  days,
  open,
  onOpenChange,
  onCta,
}: {
  tier: 2 | 3;
  action: JourneyAction;
  days: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCta: (cta: "primary" | "book_call") => void;
}) {
  const stuck = tier === 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {stuck ? "Still stuck? Let's do it together." : `It's been ${days} days.`}
          </DialogTitle>
          <DialogDescription>
            {stuck
              ? "Twenty minutes with someone who sets these up."
              : `${action.label} takes under 10 minutes.`}
          </DialogDescription>
        </DialogHeader>

        {/*
          The same two choices in both tiers, swapped. Column-reverse on a
          phone so the filled one is nearest the thumb whichever it is.
        */}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {stuck ? (
            <>
              <Button variant="ghost" asChild onClick={() => onCta("primary")}>
                <Link href={action.href}>{action.label}</Link>
              </Button>
              <Button asChild onClick={() => onCta("book_call")}>
                <a
                  href={SCHEDULE_SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <CalendarDays />
                  Book a call
                </a>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                asChild
                onClick={() => onCta("book_call")}
              >
                <a
                  href={SCHEDULE_SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a call
                </a>
              </Button>
              <Button asChild onClick={() => onCta("primary")}>
                <Link href={action.href}>{action.verb}</Link>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
