"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { pollUntil } from "@/lib/poll-until";
import {
  CHECKOUT_RETURN_PARAMS,
  parseCheckoutReturn,
  type CheckoutReturn,
} from "@/lib/subscription";

export type CheckoutReturnPhase =
  /** Not a return from Stripe — the page was opened normally. */
  | "idle"
  /** Paid; waiting for Stripe's webhook to activate the plan. */
  | "confirming"
  | "confirmed"
  /** Paid, but the webhook hasn't landed within the wait — not a failure. */
  | "delayed"
  /** Came back without paying. */
  | "cancelled";

const POLL_MS = 2_000;
const GIVE_UP_MS = 60_000;

/**
 * The return leg of Stripe Checkout.
 *
 * Stripe redirects back the moment payment succeeds, but the subscription is
 * written by its webhook a few seconds later — so arriving back proves nothing
 * yet. `isActive` is polled until it says the plan is live, the same fact the
 * rest of the app reads, rather than trusting the redirect.
 *
 * The return params are stripped from the URL straight away, so a refresh or
 * a shared link doesn't replay the confirmation.
 */
export function useCheckoutReturn(
  isActive: (result: CheckoutReturn) => Promise<boolean>,
  { onConfirmed }: { onConfirmed?: (result: CheckoutReturn) => void } = {},
): {
  phase: CheckoutReturnPhase;
  result: CheckoutReturn | null;
  dismiss: () => void;
} {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  // Captured once per mount in state rather than behind a "handled" ref: in
  // StrictMode the effect below mounts twice, and a ref guard would let the
  // first (cancelled) run swallow the return and leave nothing polling.
  const [result] = React.useState(() =>
    parseCheckoutReturn(searchParams?.toString() ?? ""),
  );
  const [phase, setPhase] = React.useState<CheckoutReturnPhase>(
    !result ? "idle" : result.outcome === "success" ? "confirming" : "cancelled",
  );

  const isActiveRef = React.useRef(isActive);
  isActiveRef.current = isActive;
  const onConfirmedRef = React.useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  React.useEffect(() => {
    if (!result) return;

    const remaining = new URLSearchParams(window.location.search);
    for (const key of CHECKOUT_RETURN_PARAMS) remaining.delete(key);
    const query = remaining.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });

    if (result.outcome !== "success") return;

    const controller = new AbortController();
    void pollUntil(() => isActiveRef.current(result), {
      intervalMs: POLL_MS,
      timeoutMs: GIVE_UP_MS,
      signal: controller.signal,
    }).then((outcome) => {
      if (outcome === "done") {
        setPhase("confirmed");
        onConfirmedRef.current?.(result);
      } else if (outcome === "timeout") {
        setPhase("delayed");
      }
    });

    return () => controller.abort();
    // `result` is fixed for the life of the mount; the router and pathname
    // are stable within it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  return { phase, result, dismiss: () => setPhase("idle") };
}
