"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StepTracker } from "@/components/onboarding/step-tracker";
import { apiErrorMessage } from "@/lib/api-error";
import {
  nexxtapDocumentsAtom,
  nexxtapHydratedAtom,
  nexxtapMetaAtom,
  nexxtapOnboardingAtom,
} from "@/lib/atoms";
import {
  NEXXTAP_STEPS,
  actionsRequired,
  fetchNexxtapOnboarding,
  isWithNexxtap,
  statusLabel,
  stepsDone,
  type NexxtapStepId,
} from "@/lib/nexxtap";
import { useBusinessesQuery } from "@/hooks/use-businesses-query";
import { activeBusiness, useBusinessesStore } from "@/stores/businesses";
import { useSessionStore } from "@/stores/session";

export const PAYMENTS_HREF = "/transactions/payments";
export const NEXXTAP_OVERVIEW_HREF = NEXXTAP_STEPS[0].href;

/**
 * The frame every NextTap onboarding step sits in.
 *
 * The same shell SolePay's onboarding uses, over NextTap's eight steps: one
 * header, one tracker, one progress bar, and the fetch that fills them. A
 * copy per page would be eight places for the count to drift from the
 * completion rules.
 *
 * It's also where the application is fetched and poured into the shared
 * atoms — every step page renders through here, so wherever someone lands
 * first is guaranteed to hydrate before its form seeds its local draft.
 */
export function NexxtapOnboardingShell({
  stepId,
  children,
}: {
  stepId: NexxtapStepId;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useAtom(nexxtapOnboardingAtom);
  const [meta, setMeta] = useAtom(nexxtapMetaAtom);
  const [documents, setDocuments] = useAtom(nexxtapDocumentsAtom);
  const [hydrated, setHydrated] = useAtom(nexxtapHydratedAtom);

  /*
   * The prefill sources. Read from the store rather than fetched: the
   * businesses list endpoint returns every business in full, so the address,
   * the ABN and the settlement account are already in hand — and the saved
   * draft wins over all of it anyway (see `hydrateFromDraft`).
   */
  const business = useBusinessesStore(activeBusiness);
  const user = useSessionStore((session) => session.user);

  /*
   * Held until the business list has landed (or failed). Each step form
   * seeds its local draft exactly once, on the first hydration — so a draft
   * fetched while the list was still in flight would seed it from a prefill
   * with no business behind it, and the business arriving a moment later
   * would never reach the form. Deduped with the sidebar's own call.
   */
  const businessesQuery = useBusinessesQuery();
  const businessesLoaded = useBusinessesStore((store) => store.hydrated);
  const prefillReady = businessesLoaded || businessesQuery.isError;

  const query = useQuery({
    queryKey: ["nexxtap-onboarding", business?.id ?? null],
    queryFn: () => fetchNexxtapOnboarding(business, user),
    enabled: prefillReady,
    // Refetched fresh on every mount rather than cached across steps — the
    // step just navigated back from changed what the server holds.
    staleTime: 0,
  });

  React.useEffect(() => {
    if (!query.data) return;
    setState(query.data.state);
    setMeta(query.data.meta);
    setDocuments(query.data.documents);
    setHydrated(true);
  }, [query.data, setState, setMeta, setDocuments, setHydrated]);

  React.useEffect(() => {
    if (query.error) {
      toast.error(
        apiErrorMessage(query.error, "Couldn't load your NextTap application"),
      );
    }
  }, [query.error]);

  const done = stepsDone(state, documents);
  const outstanding = actionsRequired(state, documents);
  const current = NEXXTAP_STEPS.findIndex((step) => step.id === stepId);
  const sent =
    isWithNexxtap(meta) ||
    meta.status === "needs_update" ||
    meta.status === "declined";

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
              Connect your NextTap account
            </h1>
            <p className="text-sm text-muted-foreground">
              NextTap needs a few details about your business before it can
              board you for tap-to-pay.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Where the application stands with NextTap, once it's been
                sent. Nothing at all before then — a chip saying "not
                submitted" would be labelling the absence of news. */}
            {sent && (
              <Badge
                variant={
                  meta.status === "approved"
                    ? "success"
                    : meta.status === "declined"
                      ? "danger"
                      : "warning"
                }
                className="tabular"
              >
                {statusLabel(meta.status)}
              </Badge>
            )}

            {/* Counted from the steps still unanswered, so it goes quiet on
                its own as the form is filled rather than needing clearing. */}
            {outstanding > 0 && (
              <Badge variant="warning" className="tabular">
                {outstanding} {outstanding === 1 ? "action" : "actions"} required
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground tabular">
            {done.length} of {NEXXTAP_STEPS.length} done
          </p>
          <div className="w-full max-w-[220px]">
            <Progress
              value={(done.length / NEXXTAP_STEPS.length) * 100}
              aria-label={`${done.length} of ${NEXXTAP_STEPS.length} onboarding steps done`}
            />
          </div>
        </div>

        {/* The tracker is the navigation here, not a read-out — so every step
            is reachable, unlike in the setup wizard where the sequence is the
            design. */}
        <StepTracker
          steps={NEXXTAP_STEPS}
          current={current === -1 ? 0 : current}
          done={done}
          onJump={(index) => router.push(NEXXTAP_STEPS[index].href)}
          label="NextTap onboarding progress"
          allowJumpAhead
        />
      </div>

      {/* `!prefillReady` too: a disabled query isn't `isLoading` in v5, so
          without it the empty form would flash up while the businesses load. */}
      {!hydrated && (!prefillReady || query.isLoading) ? (
        <div className="flex items-center justify-center gap-2 rounded-[14px] border border-border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading your NextTap application…
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * Cancel and save, stuck to the foot of the viewport.
 *
 * Shared by the six forms so the pair sits in the same place at the same size
 * on all of them — a footer that moved between steps would read as six
 * different screens rather than six steps of one.
 */
export function NexxtapStepFooter({
  onSave,
  saveLabel = "Save",
  saveDisabled,
}: {
  onSave: () => void;
  saveLabel?: React.ReactNode;
  saveDisabled?: boolean;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <Button variant="outline" asChild>
        <Link href={NEXXTAP_OVERVIEW_HREF}>Cancel</Link>
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

/** The header treatment every NextTap step's sections use. Matches SolePay's. */
export const NEXXTAP_SECTION_HEADER =
  "gap-3 px-4 py-3.5 bg-primary/[0.06] dark:bg-primary/[0.12]";
