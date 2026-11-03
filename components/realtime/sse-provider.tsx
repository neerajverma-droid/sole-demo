"use client";

/**
 * One shared SSE connection for the whole app — sole-webapp's own
 * `contexts/SSEContext.js`, ported. The chat widget doesn't open a stream of
 * its own (its `fetchEventSource` import there is dead code); it subscribes
 * to named events here instead, the same way a push notification or a
 * background-job completion would.
 *
 * Mounted once, inside `SessionProvider` (`components/providers.tsx`) — it
 * needs a signed-in user and an active business before there's anything to
 * connect for, and re-opens whenever either changes.
 */
import * as React from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";

import apiRoutes from "@/config/api-routes";
import { getAccessToken, refreshAccessToken } from "@/lib/api/session";
import { getBusinessId } from "@/utils/businessStorage";
import { useBusinessesStore } from "@/stores/businesses";
import { sessionUserId, useSessionStore } from "@/stores/session";

type SSEListener = (payload: unknown) => void;

type SSEContextValue = {
  /** Subscribes to one named event; returns the unsubscribe function. */
  on: (event: string, listener: SSEListener) => () => void;
};

const SSEContext = React.createContext<SSEContextValue | null>(null);

export function useSSE(): SSEContextValue {
  const value = React.useContext(SSEContext);
  if (!value) {
    throw new Error("useSSE must be used inside <SSEProvider>.");
  }
  return value;
}

/** A connection that will never succeed on retry — a dead tenant, a token
 *  that can't be refreshed — stops the retry loop instead of spinning on it
 *  forever. Anything else (a network blip, a 5xx) keeps retrying. */
class FatalSSEError extends Error {}

const BACKOFF_START_MS = 2000;
const BACKOFF_MAX_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 6;

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const userId = useSessionStore((state) => sessionUserId(state.user));
  const activeBusinessId = useBusinessesStore((state) => state.activeId);

  const listenersRef = React.useRef(new Map<string, Set<SSEListener>>());

  const on = React.useCallback((event: string, listener: SSEListener) => {
    const listeners = listenersRef.current.get(event) ?? new Set<SSEListener>();
    listeners.add(listener);
    listenersRef.current.set(event, listeners);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const dispatch = React.useCallback((event: string, payload: unknown) => {
    listenersRef.current.get(event)?.forEach((listener) => listener(payload));
  }, []);

  React.useEffect(() => {
    const businessId = activeBusinessId || getBusinessId();
    if (!userId || !businessId) return;

    const controller = new AbortController();
    let failures = 0;
    let gaveUp = false;

    function open() {
      if (gaveUp || controller.signal.aborted) return;
      void fetchEventSource(
        `${apiRoutes.chatbot.events}?business_id=${businessId}`,
        {
          signal: controller.signal,
          // Keeps the connection alive on a background tab — a message that
          // arrived while this tab wasn't focused shouldn't be lost.
          openWhenHidden: true,
          headers: {
            Authorization: `Bearer ${getAccessToken() ?? ""}`,
            "x-business-id": String(businessId),
          },
          async onopen(response) {
            if (response.ok) {
              failures = 0;
              return;
            }
            if (response.status === 401) {
              const refreshed = await refreshAccessToken();
              if (!refreshed) throw new FatalSSEError("Session expired");
              // Resolving without throwing keeps this attempt open on the
              // stale token for whatever's left of the request; the next
              // reconnect (triggered by the server closing it) picks up the
              // refreshed one from `getAccessToken()` above.
              return;
            }
            if ([400, 403, 404].includes(response.status)) {
              throw new FatalSSEError(`SSE rejected: ${response.status}`);
            }
            throw new Error(`SSE error: ${response.status}`);
          },
          onmessage(message) {
            if (!message.data) return;
            try {
              const parsed = JSON.parse(message.data) as {
                event?: string;
                data?: unknown;
              };
              if (parsed.event) dispatch(parsed.event, parsed.data ?? parsed);
            } catch {
              // A malformed frame is a server bug, not something to crash a
              // tab over — drop it and keep listening.
            }
          },
          onerror(error) {
            if (error instanceof FatalSSEError) {
              gaveUp = true;
              throw error;
            }
            failures += 1;
            if (failures > MAX_CONSECUTIVE_FAILURES) {
              gaveUp = true;
              throw error;
            }
            // Returning a number tells fetchEventSource "retry after this
            // many ms" instead of giving up — doubling, capped, so a longer
            // outage doesn't hammer the server every two seconds.
            return Math.min(
              BACKOFF_START_MS * 2 ** (failures - 1),
              BACKOFF_MAX_MS,
            );
          },
        },
      );
    }

    open();

    function onOnline() {
      if (!gaveUp) return;
      gaveUp = false;
      failures = 0;
      open();
    }
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("online", onOnline);
      controller.abort();
    };
  }, [userId, activeBusinessId, dispatch]);

  const value = React.useMemo<SSEContextValue>(() => ({ on }), [on]);

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}
