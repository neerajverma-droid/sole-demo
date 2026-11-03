"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StepTracker } from "@/components/onboarding/step-tracker";
import {
  solePayHydratedAtom,
  solePayMetaAtom,
  solePayOnboardingAtom,
} from "@/lib/atoms";
import {
  SOLEPAY_APPLICATION_STATUS_COPY,
  SOLEPAY_STEPS,
  actionsRequired,
  fetchSolePayDraft,
  isSolePayApplicationLocked,
  stepsDone,
  type SolePayApplicationStatus,
  type SolePayStepId,
} from "@/lib/solepay";

export const PAYMENTS_HREF = "/payments";
export const SOLEPAY_OVERVIEW_HREF = SOLEPAY_STEPS[0].href;

/**
 * Re-seeds a step's local draft state once the real fetch has actually
 * landed — the fix for data "not mapping" after a hard refresh directly on
 * a step page.
 *
 * Every step screen seeds its own edit draft with `useState(state.entity)`
 * (etc.) in its OWN function body — and that screen is the one rendering
 * `SolePayOnboardingShell`, not a child the shell mounts conditionally. So
 * the shell's own `!hydrated` gate, which only hides JSX, can't delay a
 * `useState` initializer that already ran earlier in the very same render.
 * On a hard refresh, that first render always happens before the draft
 * fetch resolves, so the draft gets seeded from `EMPTY_SOLEPAY_ONBOARDING`
 * and stays that way — `useState`'s initial value is only read once, on
 * mount, and never re-applied when the atom updates later.
 *
 * This hook hands back `hydrated` and calls `onHydrated` exactly once, the
 * first time it flips true, so a screen can resync its draft from the atom
 * for real at that point. A ref guard rather than a dependency-array trick,
 * so this can't refire on a later re-render for an unrelated reason (a
 * fresh `state` reference after a Save, for instance).
 */
export function useSolePayHydration(onHydrated: () => void) {
  const hydrated = useAtomValue(solePayHydratedAtom);
  const ranRef = React.useRef(false);
  const onHydratedRef = React.useRef(onHydrated);
  onHydratedRef.current = onHydrated;

  React.useEffect(() => {
    if (!hydrated || ranRef.current) return;
    ranRef.current = true;
    onHydratedRef.current();
  }, [hydrated]);

  return hydrated;
}

/**
 * The frame every onboarding step sits in.
 *
 * One shell rather than the same header three times: the title, the tracker and
 * the progress bar are the same on every step and only the current index
 * differs, so a copy per page is three places for the count to drift from the
 * completion rules.
 *
 * This is also where the real draft gets fetched and poured into the shared
 * atoms — every step page renders through here, so wherever someone lands
 * first is guaranteed to hydrate before its form seeds its local draft from
 * the atom.
 */
export function SolePayOnboardingShell({
  stepId,
  children,
}: {
  stepId: SolePayStepId;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useAtom(solePayOnboardingAtom);
  const [meta, setMeta] = useAtom(solePayMetaAtom);
  const [hydrated, setHydrated] = useAtom(solePayHydratedAtom);

  const draftQuery = useQuery({
    queryKey: ["solepay-draft"],
    queryFn: fetchSolePayDraft,
    // Refetched fresh on every mount rather than cached across steps — the
    // step just navigated back from may have changed what the server holds,
    // and this is cheap enough to just ask again.
    staleTime: 0,
  });

  React.useEffect(() => {
    if (draftQuery.data) {
      setState(draftQuery.data.state);
      setMeta(draftQuery.data.meta);
    }
    /*
     * Set on success AND on error, not only on a truthy `data` — a step
     * screen's local draft is seeded from the atom the instant it mounts
     * (`useState(state.entity)`, etc.), so `children` must never render
     * before this effect has actually written the atom. Gating the render
     * below on `draftQuery.isLoading` instead of this flag looked
     * equivalent but wasn't: React Query flips `isLoading` to false in the
     * very same render `data` first appears in, one render before this
     * effect (which only runs after that render commits) gets to update
     * the atom — so the child mounted a render early, seeding itself from
     * the still-empty default. Also unblocks the form on a genuine fetch
     * failure instead of spinning forever.
     */
    if (draftQuery.isSuccess || draftQuery.isError) {
      setHydrated(true);
    }
  }, [
    draftQuery.data,
    draftQuery.isSuccess,
    draftQuery.isError,
    setState,
    setMeta,
    setHydrated,
  ]);

  React.useEffect(() => {
    if (draftQuery.error) {
      toast.error(
        draftQuery.error instanceof Error
          ? draftQuery.error.message
          : "Failed to load your SolePay details",
      );
    }
  }, [draftQuery.error]);

  const done = stepsDone(state);
  const outstanding = actionsRequired(state);
  const current = SOLEPAY_STEPS.findIndex((step) => step.id === stepId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={PAYMENTS_HREF}>
            <ArrowLeft />
            Payments
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Connect your SolePay account
            </h1>
            <p className="text-sm text-muted-foreground">
              SolePay needs a few details about your business before it can
              settle payments to you.
            </p>
          </div>

          {/* Counted from the steps still unanswered, so it goes quiet on its
              own as the form is filled rather than needing to be cleared. */}
          {outstanding > 0 && (
            <Badge variant="warning" className="shrink-0 tabular">
              {outstanding} {outstanding === 1 ? "action" : "actions"} required
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground tabular">
            {done.length} of {SOLEPAY_STEPS.length} done
          </p>
          <div className="w-full max-w-[220px]">
            <Progress
              value={(done.length / SOLEPAY_STEPS.length) * 100}
              aria-label={`${done.length} of ${SOLEPAY_STEPS.length} onboarding steps done`}
            />
          </div>
        </div>

        {/* The tracker is the navigation here, not a read-out — so every step
            is reachable, unlike in the setup wizard where the sequence is the
            design. */}
        <StepTracker
          steps={SOLEPAY_STEPS}
          current={current === -1 ? 0 : current}
          done={done}
          onJump={(index) => router.push(SOLEPAY_STEPS[index].href)}
          label="SolePay onboarding progress"
          allowJumpAhead
        />
      </div>

      {!hydrated ? (
        <div className="flex items-center justify-center gap-2 rounded-[14px] border border-border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading your SolePay details…
        </div>
      ) : isSolePayApplicationLocked(meta) ? (
        <SolePayLockedNotice applicationStatus={meta.applicationStatus} />
      ) : (
        children
      )}
    </div>
  );
}

function SolePayLockedNotice({
  applicationStatus,
}: {
  applicationStatus: SolePayApplicationStatus;
}) {
  const copy = SOLEPAY_APPLICATION_STATUS_COPY[applicationStatus];
  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border border-border bg-card px-6 py-16 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Lock className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          This application has already been submitted and can&apos;t be
          edited here. {copy.description}
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href={PAYMENTS_HREF}>Back to Payments</Link>
      </Button>
    </div>
  );
}

/**
 * Cancel and save, stuck to the foot of the viewport.
 *
 * Shared by the two forms so the pair sits in the same place at the same size
 * on both — a footer that moved between steps would read as two different
 * screens rather than two steps of one.
 */
export function SolePayStepFooter({
  onSave,
  saveLabel = "Save",
  saveDisabled,
}: {
  onSave: () => void;
  saveLabel?: React.ReactNode;
  /** For a step that can't be completed yet — Documents before Accounts, or a save in flight. */
  saveDisabled?: boolean;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <Button variant="outline" asChild>
        <Link href={SOLEPAY_OVERVIEW_HREF}>Cancel</Link>
      </Button>
      <Button
        className="rounded-[9px] gap-1.5"
        disabled={saveDisabled}
        onClick={onSave}
      >
        {saveLabel}
      </Button>
    </div>
  );
}
