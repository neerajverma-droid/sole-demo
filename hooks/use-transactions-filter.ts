"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { transactionsFilterAtom } from "@/lib/atoms";
import { transactionsTabHref } from "@/lib/bank-transactions";
import type { TransactionFilter } from "@/lib/transactions";

/**
 * The Transactions tab, kept in the URL as well as the atom.
 *
 * The atom alone forgot it on a refresh, so a reload from Matched always came
 * back on Unmatched. Picking a tab now also writes `?status=` — the same deep
 * link the dashboard already uses and the screen already reads — so a refresh,
 * a shared link or Back lands on the tab that was open. Unmatched is the
 * default, so it clears the param rather than writing it. Other params (a
 * search or undo deep link) are left as they are.
 */
export function useTransactionsFilter() {
  const [filter, setFilterAtom] = useAtom(transactionsFilterAtom);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setFilter = React.useCallback(
    (next: TransactionFilter) => {
      setFilterAtom(next);
      router.replace(
        transactionsTabHref(
          pathname ?? "/transactions",
          searchParams?.toString() ?? "",
          next,
        ),
        { scroll: false },
      );
    },
    [setFilterAtom, router, pathname, searchParams],
  );

  return [filter, setFilter] as const;
}
