"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchUniboxAssets,
  fetchUniboxBankTransactions,
  fetchUniboxEquity,
  fetchUniboxExpenses,
  fetchUniboxInvoices,
  fetchUniboxLiabilities,
  fetchUniboxOnboarding,
  fetchUniboxPriorities,
  fetchUniboxProgress,
  fetchUniboxProjects,
  fetchUniboxQuotes,
  fetchUniboxTimeEntries,
  fetchUniboxTrips,
  fetchUniboxWorkComingUp,
} from "@/lib/unibox";
import { overlayDemo } from "@/lib/unibox-demo";
import { useTourDemoStore } from "@/stores/tour-demo";

/**
 * One query per Unibox section, all under `["unibox", …]`.
 *
 * Separate rather than one bundle because the old page refreshed them one at
 * a time — matching an expense refetches expenses and priorities, not the
 * whole page — and a section that fails costs that card only, which is what
 * its `Promise.allSettled` was for.
 */
const SECTIONS = {
  progress: fetchUniboxProgress,
  onboarding: fetchUniboxOnboarding,
  priorities: fetchUniboxPriorities,
  invoices: fetchUniboxInvoices,
  quotes: fetchUniboxQuotes,
  expenses: fetchUniboxExpenses,
  timeTracker: fetchUniboxTimeEntries,
  projects: fetchUniboxProjects,
  kmTracker: fetchUniboxTrips,
  bankTransactions: fetchUniboxBankTransactions,
  assets: fetchUniboxAssets,
  workComingUp: fetchUniboxWorkComingUp,
  liabilities: fetchUniboxLiabilities,
  equity: fetchUniboxEquity,
} as const;

export type UniboxSection = keyof typeof SECTIONS;

type SectionData<S extends UniboxSection> = Awaited<ReturnType<(typeof SECTIONS)[S]>>;

export function uniboxKey(section: UniboxSection) {
  return ["unibox", section] as const;
}

export function useUniboxQuery<S extends UniboxSection>(section: S) {
  const query = useQuery<SectionData<S>>({
    queryKey: uniboxKey(section),
    queryFn: SECTIONS[section] as () => Promise<SectionData<S>>,
    staleTime: 30_000,
  });

  /*
   * While the Quick Actions tour runs, a section with nothing in it draws a
   * few sample rows (`lib/unibox-demo.ts`) so every card has something to
   * point at. Only once the real answer is in — an empty list is "nothing
   * yet", a pending one is just "not known" — and only in what is returned
   * here: the query cache keeps the server's own answer, so the samples
   * vanish the moment the tour ends and can never be mistaken for data.
   */
  const demoActive = useTourDemoStore((state) => state.active);
  const settled = !query.isLoading;
  const overlay = React.useMemo(
    () =>
      demoActive && settled && section !== "onboarding"
        ? overlayDemo(section, query.data)
        : { data: query.data, sampled: false },
    [demoActive, settled, section, query.data],
  );

  const setSampled = useTourDemoStore((state) => state.setSampled);
  React.useEffect(() => {
    setSampled(section, overlay.sampled);
    return () => setSampled(section, false);
  }, [section, overlay.sampled, setSampled]);

  return { ...query, data: overlay.data as SectionData<S> | undefined, isDemo: overlay.sampled };
}

/** Refetch some sections — what each card's `onRefresh` does. */
export function useRefreshUnibox() {
  const queryClient = useQueryClient();
  return (...sections: UniboxSection[]) =>
    Promise.all(
      sections.map((section) =>
        queryClient.invalidateQueries({ queryKey: uniboxKey(section) }),
      ),
    );
}
