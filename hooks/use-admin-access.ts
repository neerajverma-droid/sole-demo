"use client";

import * as React from "react";
import axios from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/components/auth/session-provider";
import { sessionUserId } from "@/stores/session";
import { NO_ADMIN_ACCESS, canPass, type AdminGate } from "@/lib/admin/access";
import { fetchAdminAccess } from "@/lib/admin/access-api";

/** Prefix of the access query, for invalidating it from elsewhere. */
export const ADMIN_ACCESS_KEY = ["admin", "access"] as const;

/**
 * The admin sections this account can open, fetched once and shared.
 *
 * The guard, the sidebar and the Command Centre hub all read this one query,
 * so a page load asks `/super/my-access` once. Fails closed: while loading, or
 * if the call errors, the answer is "nothing", and the guard shows its own
 * state for each rather than drawing a sidebar it would then have to take back.
 */
export function useAdminAccess() {
  const { status, user } = useSession();

  const query = useQuery({
    /*
     * Keyed on the user, and on the id the profile actually carries.
     * This read `user?.id`, which never arrives — so the key was a constant
     * and two different admins signing in on the same browser shared one
     * cached grant list for as long as it stayed fresh.
     */
    queryKey: [...ADMIN_ACCESS_KEY, sessionUserId(user)],
    queryFn: fetchAdminAccess,
    enabled: status === "authenticated",
    /*
     * Fresher than the app's five-minute default. Grants are changed by
     * someone else, on another screen, and an admin who just lost a section
     * should stop seeing it the next time they come back to the tab, not
     * five minutes later. The call is one indexed lookup, so asking often is
     * cheap. A 403 from any admin request also refetches it — see
     * `useRecheckAccessOnForbidden`.
     */
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const access = query.data ?? NO_ADMIN_ACCESS;

  return {
    access,
    isSuperAdmin: access.isSuperAdmin,
    canSee: (gate: AdminGate) => canPass(gate, access),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

function isForbidden(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 403;
}

/** Admin data lives under `["admin", …]`; the access query itself is excluded. */
function isAdminDataKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "admin" && queryKey[1] !== ADMIN_ACCESS_KEY[1];
}

/**
 * Re-ask `/super/my-access` the moment the backend refuses an admin request.
 *
 * A 403 here almost always means the grants changed while this tab was open —
 * a super admin removed a section. Re-reading access makes the guard and the
 * sidebar catch up straight away: the row disappears and, if this page was
 * that section, the guard moves the admin to one they can still open. Without
 * it they'd sit on an error state until the access cache went stale.
 *
 * Mounted once, by the admin guard.
 */
export function useRecheckAccessOnForbidden() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const recheck = () => queryClient.invalidateQueries({ queryKey: ADMIN_ACCESS_KEY });

    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      if (isAdminDataKey(event.query.queryKey) && isForbidden(event.action.error)) void recheck();
    });

    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      if (isForbidden(event.action.error)) void recheck();
    });

    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [queryClient]);
}
