"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { useSession } from "@/components/auth/session-provider";
import {
  identify,
  initAnalytics,
  normalisePath,
  resetAnalytics,
  setBusinessContext,
  track,
} from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { derivePlan } from "@/lib/analytics";
import { useBusinessesStore } from "@/stores/businesses";
import { useSubscriptionStore } from "@/stores/subscription";

/**
 * Boots Mixpanel once per app load and keeps its identity in step with
 * whoever is signed in.
 *
 * Mount this INSIDE `SessionProvider`, next to `UsertourBootstrap`:
 * `useSession` throws outside it, and as a sibling it could not see the
 * session at all. The same reasoning is already written into the tour
 * bootstrap, and for the same reason — the tour read a store nothing ever
 * wrote to, so it identified nobody for the life of that integration.
 */

/**
 * `/reports/profit-loss` → `"profit-loss"`. Anything else → null.
 *
 * Deliberately only the immediate child of `/reports`: a drill-down deeper
 * inside one report is still that report being read, and splitting it would
 * make the ten reports look like thirty.
 */
export function reportFromPath(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== "reports" || segments.length < 2) return null;
  return segments[1] ?? null;
}

export function AnalyticsBootstrap() {
  const { user, status } = useSession();
  const pathname = usePathname();
  const businessId = useBusinessesStore((state) => state.activeId);
  // `TopBar` fetches this on every authenticated page via
  // `useSubscriptionQuery`; read rather than refetched here.
  const subscription = useSubscriptionStore((state) => state.subscription);
  const plan = derivePlan(subscription);

  /*
   * `user_id`, not `id`. The profile endpoint returns `user_id`; `AuthUser`
   * declares an optional `id` that never arrives, and because every field on
   * that type is optional, reading the wrong one type-checks cleanly and
   * silently identifies nobody. That exact mistake is why all 479 profiles in
   * the old project are keyed on an email address.
   */
  const rawId = user?.user_id ?? user?.id;
  const userId = rawId == null || rawId === "" ? null : String(rawId);

  const name =
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    null;

  // Strict Mode runs effects twice in development; `initAnalytics` is
  // idempotent, so this needs no guard of its own.
  React.useEffect(() => {
    initAnalytics();
  }, []);

  /*
   * Only reset for somebody who was actually signed in.
   *
   * A logged-out visitor's status settles loading → unauthenticated on the
   * first paint, and `reset()` clears the super properties — including the
   * first-touch campaign attribution `initAnalytics` has just registered. A
   * blanket reset here would wipe the UTM of every visitor arriving from an
   * ad before they ever reached the signup form.
   */
  const wasIdentified = React.useRef(false);

  React.useEffect(() => {
    /*
     * "loading" is the first render on every page load, before /auth/profile
     * settles. Identifying then is guessing, and resetting then would sign the
     * person out of Mixpanel on each navigation.
     */
    if (status === "loading") return;

    if (status === "authenticated") {
      wasIdentified.current = true;
      identify({
        userId,
        email: user?.email ?? null,
        name,
        plan,
        // Prefer the subscription record once it has loaded — the backend
        // field this falls back to carries the same gap `plan` does. Used
        // only before the fetch lands, so the first identify of a session
        // isn't blocked on it.
        trialActive: subscription?.isTrialing ?? user?.trial_active ?? null,
        businessId: businessId || null,
      });
      return;
    }

    if (wasIdentified.current) {
      wasIdentified.current = false;
      resetAnalytics();
    }
  }, [
    status,
    userId,
    name,
    user?.email,
    plan,
    subscription?.isTrialing,
    user?.trial_active,
    businessId,
  ]);

  // The business can change without the session doing so.
  React.useEffect(() => {
    if (status !== "authenticated") return;
    setBusinessContext(businessId || null);
  }, [status, businessId]);

  /*
   * Page views.
   *
   * There is no `router.events` in the App Router, so this comes from
   * `usePathname()`. The query string is deliberately left out: it carries
   * filter state and, on the invoice-share routes, a token.
   *
   * Latched on the path so Strict Mode's second effect — and any re-render
   * under the same route — cannot report the same view twice.
   */
  const lastPath = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!pathname) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    track(EVENTS.PAGE_VIEW, {
      path: pathname,
      route: normalisePath(pathname),
    });

    /*
     * Reports, from the route rather than from ten screens.
     *
     * Normally "a screen opened" is not an event — the old app shipped 9,432
     * `module_used` rows carrying `action: "viewed"` and they answer nothing.
     * A report is the exception: opening it IS the action. There is nothing
     * else to do on the page.
     *
     * One event with a `report` property, not ten names, so the eleventh
     * report needs no code here and no change to the chart reading it.
     */
    const report = reportFromPath(pathname);
    if (report) track(EVENTS.REPORT_VIEWED, { report });
  }, [pathname]);

  return null;
}
