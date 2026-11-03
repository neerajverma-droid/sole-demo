"use client";

import Link from "next/link";
import { CalendarDays, Check, ChevronRight, Target } from "lucide-react";
import { useAtomValue } from "jotai";

import {
  ActionRowShell,
  ROW_ACTION,
  ROW_ACTION_TINTED,
} from "@/components/actions/action-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { STAT_TONES } from "@/components/ui/stat-cards";
import { authNameAtom } from "@/lib/atoms";
import {
  FALLBACK_JOURNEY,
  journeyById,
  type JourneyAction,
} from "@/lib/journeys";
import { titleCaseName } from "@/lib/onboarding";
import { SCHEDULE_SUPPORT_URL } from "@/lib/support";
import { cn } from "@/lib/utils";
import { useWelcomeStore } from "@/stores/welcome";

/**
 * The New tab: what to do first, for this account's route.
 *
 * Quick Actions is a queue derived from documents, which is exactly nothing on
 * an account that has none — so the page had two audiences and one answer. This
 * is the other answer: the same route, the same tab strip, and a panel that
 * names the one act worth doing on day one.
 *
 * Built out of the Data tab's own row — `ActionRowShell` — rather than a layout
 * of its own, because the two tabs are one screen with a switch on it. Same
 * icon square, same title, same meta line, same lanes at the right edge: what
 * differs is that these rows navigate somewhere and Data's clear something.
 *
 * Everything it offers comes from the journey first run resolved — see
 * `JourneyFirstRun`. Nothing here knows what a consultant should do differently
 * from a market trader; it renders whichever list the journey carries, which is
 * what stops this becoming a screen that quietly ships one industry's idea of a
 * first day to all of them.
 *
 * Not a sequence, and the copy says so. There are no numbers on the rows: the
 * primary is the loud one and the icons say what each is, which is enough
 * ordering for a list where every row works from the first second.
 */
export function FirstRunPanel() {
  const accountName = useAtomValue(authNameAtom);
  const journeyId = useWelcomeStore((state) => state.journey);
  const firstValueDone = useWelcomeStore((state) => state.firstValueDone);
  const completeFirstValue = useWelcomeStore(
    (state) => state.completeFirstValue,
  );

  /*
   * The journey, or the safest one there is.
   *
   * Null is reachable two ways: an account that predates the question, and one
   * mid-first-run that hasn't answered it yet. `FALLBACK_JOURNEY` is the
   * product's existing answer to both — invoicing is the route every other one
   * is reachable from without redoing anything.
   */
  const journey = journeyById(journeyId ?? FALLBACK_JOURNEY);
  const { primary, secondary, timeToValue } = journey.firstRun;

  /*
   * The first name only. The account holds whatever was typed at sign-up,
   * which is usually two words and occasionally lower case — a greeting is the
   * one place in the product where "jane" rather than "Jane" reads as a bug.
   */
  const firstName = titleCaseName(accountName.trim().split(/\s+/)[0] ?? "");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {/* No comma with nothing after it: the name arrives from storage after
            mount, so the first paint has none. */}
        <h2 className="text-xl font-semibold tracking-tight">
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {firstValueDone
            ? "That's the first one done. The rest is here when you want it."
            : "One thing to do first. Everything else can wait."}
        </p>
      </div>

      {/* The same card the five urgent items sit in on the other tab: heading
          on the left, a figure on the right, a rule, then rows. */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Target className="size-4 shrink-0 text-primary" aria-hidden />
              <h2 className="text-base font-semibold">One thing to do first</h2>
            </div>
            {/*
              Said out loud, because a list with a loud row at the top implies
              the opposite. Someone whose week starts with the third row
              shouldn't have to wonder whether pressing it is allowed.
            */}
            <p className="text-sm text-muted-foreground">
              Start with whichever fits — you don&apos;t have to go in order.
            </p>
          </div>

          {/* The route's own promise, where Data puts its count. */}
          <p className="shrink-0 text-xs text-muted-foreground">
            {timeToValue}
          </p>
        </div>

        <Separator className="my-4" />

        <ul className="divide-y divide-border/70">
          {/* The route's first value. The only loud row — a column of
              primaries is a column with no primary in it. */}
          <li className="group">
            <FirstRunRow
              action={primary}
              emphasis="primary"
              done={firstValueDone}
              onSelect={completeFirstValue}
            />
          </li>

          {secondary.map((action) => (
            <li key={action.id} className="group">
              <FirstRunRow action={action} emphasis="secondary" />
            </li>
          ))}
        </ul>

        {/*
          Help, below a rule of its own.

          Always here, on every route and in both states — and separated,
          because it isn't one of the journey's actions. It's the way out for
          someone who has read three rows and doesn't want to press any of
          them, and an account that gets stuck on day one and can't find a
          person is an account that doesn't come back on day two.
        */}
        <Separator className="mt-4" />
        <div className="group">
          <ActionRowShell
            icon={CalendarDays}
            iconTone="bg-muted text-muted-foreground"
            flush
            title="Book a call"
            meta={
              <span className="truncate text-xs text-muted-foreground">
                Stuck on any of this? Twenty minutes with someone who sets these
                up.
              </span>
            }
            action={
              <Button
                asChild
                size="sm"
                variant="ghost"
                className={cn(ROW_ACTION, ROW_ACTION_TINTED)}
              >
                <a
                  href={SCHEDULE_SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book
                  <ChevronRight />
                </a>
              </Button>
            }
          />
        </div>
      </Card>
    </div>
  );
}

/**
 * One journey action, in the shared row.
 *
 * The emphasis is carried entirely by the CTA — solid indigo for the route's
 * first value, the tinted pill the urgent five wear for everything else. The
 * row itself is identical either way, which is what makes the list scannable:
 * one shape, one loud button.
 */
function FirstRunRow({
  action,
  emphasis,
  done = false,
  onSelect,
}: {
  action: JourneyAction;
  emphasis: "primary" | "secondary";
  /** The first-value action, already taken. Only the primary can be. */
  done?: boolean;
  onSelect?: () => void;
}) {
  const loud = emphasis === "primary" && !done;

  return (
    <ActionRowShell
      icon={action.icon}
      // Muted once it's done: the row stays where it is, because it's still
      // the headline act of this route, but it stops asking to be pressed.
      iconTone={done ? "bg-muted text-muted-foreground" : STAT_TONES.primary}
      flush
      title={action.label}
      meta={
        <>
          {/*
            The same badge Data puts the type in — `outline` brings no colour
            of its own, so the tint is the whole treatment. Dropped once the
            action is done: a finished row recommending itself is a row
            arguing with the tick beside it.
          */}
          {loud && (
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 rounded-full border-transparent px-2 py-0 text-[11px] font-medium",
                STAT_TONES.primary,
              )}
            >
              Recommended
            </Badge>
          )}
          <span className="truncate text-xs text-muted-foreground">
            {action.helper}
          </span>
        </>
      }
      action={
        done ? (
          /* Where the button was, so the lane still lines up with the rows
             underneath it. */
          <p
            className={cn(
              ROW_ACTION,
              "flex items-center justify-center gap-1.5 text-sm font-medium text-success",
            )}
          >
            <Check className="size-4 shrink-0" aria-hidden />
            Done
          </p>
        ) : (
          <Button
            asChild
            size="sm"
            variant={loud ? "default" : "ghost"}
            className={cn(ROW_ACTION, !loud && ROW_ACTION_TINTED)}
          >
            {/*
              The CTA navigates, where Data's clears. Marking first value
              happens on the way out rather than on arrival at the editor:
              this is the only place that knows which action was the route's
              primary one.
            */}
            <Link href={action.href} onClick={onSelect}>
              {action.verb}
              <ChevronRight />
            </Link>
          </Button>
        )
      }
    />
  );
}
