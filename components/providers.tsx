"use client";

import * as React from "react";
import { Provider as JotaiProvider } from "jotai";
import { ThemeProvider } from "next-themes";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

import { SessionProvider } from "@/components/auth/session-provider";
import { SSEProvider } from "@/components/realtime/sse-provider";
import {
  getAccessToken,
  getRefreshToken,
  ensureRefreshToken,
} from "@/lib/api/session";
import { registerQueryCache } from "@/lib/api/teardown";
import { useBusinessesStore } from "@/stores/businesses";
import { useDashboardStore } from "@/stores/dashboard";
import { useOnboardingStore } from "@/stores/onboarding";
import { sessionUserId, useSessionStore } from "@/stores/session";
import { UsertourBootstrap } from "@/components/usertour/usertour-bootstrap";
import { AnalyticsBootstrap } from "@/components/analytics/analytics-bootstrap";
import { LocatorBootstrap } from "@/components/dev/locator-bootstrap";

/**
 * Everything React Query holds was fetched for one signed-in user, against
 * one business — `axiosInstance` stamps `business_id` onto every request from
 * whatever the switcher last selected. Neither switching business nor signing
 * in as someone else re-mounts the app, so without this the cache would carry
 * the previous context's invoices, liabilities and equity across the switch
 * and hand them straight back for as long as they stayed fresh.
 *
 * Nothing is cleared until both halves of the scope are known: `activeId` and
 * the profile both arrive from persisted storage a tick after mount, and
 * treating that arrival as a switch would throw away the requests the first
 * screen had already started.
 */
function QueryCacheScope() {
  const queryClient = useQueryClient();
  const activeId = useBusinessesStore((state) => state.activeId);
  const userId = useSessionStore((state) => sessionUserId(state.user));

  const settled = Boolean(userId) && Boolean(activeId);
  const scope = `${userId ?? ""}:${activeId ?? ""}`;
  const previous = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!settled) return;
    const before = previous.current;
    previous.current = scope;
    // First settled scope of the session is the one already being fetched for.
    if (before === null || before === scope) return;
    queryClient.clear();
  }, [settled, scope, queryClient]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser tab, not per render — a client created during
  // render would be thrown away and rebuilt on every re-render.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /*
             * Five minutes, not thirty seconds. Every list on the app mirrors
             * its query into a store and re-mounts whenever a screen is
             * revisited, a tab inside a screen is switched or a dialog closes
             * — with a short window nearly all of those re-mounts landed on
             * stale data and fired the request again, and the table dropped
             * to a shimmer while it was in flight. A write still shows up
             * immediately: mutations invalidate their keys, and invalidation
             * refetches regardless of how fresh the data was.
             */
            staleTime: 5 * 60_000,
            /*
             * How long an unused list survives after its last screen
             * unmounts. The default five minutes meant coming back to
             * Invoices after a while re-ran the *first-load* path (no cached
             * data at all), which is the full-page shimmer rather than a
             * quiet background refresh.
             */
            gcTime: 30 * 60_000,
            /*
             * Alt-tabbing to the browser's other tab, or back from a file
             * picker / print dialog a modal opened, is not a reason to throw
             * the table away and ask the server again. Screens that genuinely
             * need live data poll on their own (rules' sync stats), and any
             * write the user makes invalidates its own keys.
             */
            refetchOnWindowFocus: false,
            // Same reasoning for a brief network blip.
            refetchOnReconnect: false,
            retry: 1,
          },
        },
      }),
  );

  /*
   * Hand the cache to the sign-out teardown.
   *
   * Everything React Query holds was fetched for one signed-in user against
   * one business, and signing out doesn't re-mount the app — so without this
   * the previous user's invoices and figures stayed in memory and were handed
   * straight back to whoever signed in next, for as long as they stayed
   * fresh. The client lives in this component's state, which a plain module
   * function can't reach; registering it is what lets `clearSession()` empty
   * it from anywhere. See `lib/api/teardown.ts`.
   */
  React.useEffect(() => registerQueryCache(queryClient), [queryClient]);

  React.useEffect(() => {
    void useOnboardingStore.persist.rehydrate();
    void useDashboardStore.persist.rehydrate();
    // Which business is open, so the rail names the right one on arrival.
    void useBusinessesStore.persist.rehydrate();
    // Who's signed in, so a refresh doesn't lose the name/profile the sidebar
    // and settings screens read.
    void useSessionStore.persist.rehydrate();
  }, []);

  // Back-fill the refresh half of a session that hasn't got one: a session
  // created before refresh tokens existed, or one whose refresh token outlived
  // its window. Both still have a valid access token right now, which is enough
  // for the server to issue a new refresh token — waiting for the access token
  // to expire first would strand the person at the sign-in screen.
  React.useEffect(() => {
    if (getAccessToken() && !getRefreshToken()) void ensureRefreshToken();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <QueryCacheScope />
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        // Without this every themed surface animates its colour on a theme switch,
        // which reads as a flash rather than a change.
        disableTransitionOnChange
      >
        <JotaiProvider>
          {/*
           * The sidebar's own SidebarProvider happens to bundle a nested
           * TooltipProvider too, but that only ever covered pages inside the
           * app shell — anything outside it (auth, the businesses chooser)
           * had no ancestor provider at all until this one.
           */}
          <TooltipProvider>
            <SessionProvider>
              {/* Inside SessionProvider: it reads the session via useSession,
                  which throws outside it. */}
              <SSEProvider>
                <UsertourBootstrap />
                <AnalyticsBootstrap />
                <LocatorBootstrap />
                {children}
              </SSEProvider>
            </SessionProvider>
          </TooltipProvider>
        </JotaiProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
