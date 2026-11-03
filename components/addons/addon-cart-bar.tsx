"use client";

import * as React from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { clearSelectedAddonsAtom, selectedAddonsAtom } from "@/lib/atoms";
import { useAddons } from "@/hooks/use-addons";

/**
 * The cart, pinned to the foot of whatever is showing the catalogue.
 *
 * Paid add-ons don't activate on a click — they're chosen, then put on the
 * subscription together. Which needs somewhere permanent to say what's in the
 * cart and what it comes to, because a per-card "Selected" tick tells you about
 * one add-on and nothing about the bill.
 *
 * Renders nothing on an empty cart. A bar reading "0 selected · $0/month" would
 * be furniture at the bottom of every catalogue anyone ever opened.
 *
 * Reads the cart itself rather than taking it as a prop: two surfaces show this
 * — the More modal and onboarding's fifth step — and a cart passed in is a cart
 * one of them can pass in wrongly.
 *
 * ── What the button actually does ───────────────────────────────────────────
 *
 * It no longer takes money, and the copy says so. On a live subscription the
 * add-ons are added to it as Stripe items with proration switched off, which
 * means **nothing is charged today** — they arrive on the next invoice, and
 * they work immediately. "Add & pay" over a charge that doesn't happen was the
 * one piece of copy here that couldn't be left alone.
 *
 * With no live subscription there's nothing to add items to, so this hands off
 * to Stripe Checkout and the person comes back through it. Nothing is on the
 * plan until they do, which is why that branch navigates instead of toasting.
 */
export function AddonCartBar() {
  const selected = useAtomValue(selectedAddonsAtom);
  const clearSelected = useSetAtom(clearSelectedAddonsAtom);
  const { buy, busy, costOf, mode, subscription } = useAddons();

  if (selected.length === 0) return null;

  const monthly = costOf(selected);

  /**
   * When they'll actually be billed for it.
   *
   * `subscriptionDueDate` is the end of the current paid period, which is the
   * day the next invoice is raised — so it's the honest answer to "when does
   * this cost me anything". Absent on a plan with no period to end, and the
   * copy drops the clause rather than inventing a date.
   */
  const nextInvoice = subscription?.subscriptionDueDate
    ? new Date(subscription.subscriptionDueDate).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : null;

  const confirm = async () => {
    try {
      const { checkoutUrl } = await buy(selected);

      if (checkoutUrl) {
        // Nothing is on the plan yet — Stripe is. The cart stays put so coming
        // back without paying leaves the selection where they left it.
        window.location.href = checkoutUrl;
        return;
      }

      clearSelected();
      toast.success(
        selected.length === 1 ? "Add-on added" : "Add-ons added to your plan",
        {
          description: nextInvoice
            ? `$${monthly}/month, from your next invoice on ${nextInvoice}. They're ready to use now, under Add-ons in the sidebar.`
            : `$${monthly}/month, from your next invoice. They're ready to use now, under Add-ons in the sidebar.`,
        },
      );
    } catch (error) {
      toast.error("That didn't go through", {
        description:
          error instanceof Error
            ? error.message
            : "Nothing was added to your plan. Try again in a moment.",
      });
    }
  };

  /*
   * A subscription bought through the App Store or Play can't be changed from
   * here — Stripe isn't billing it, so there's no subscription to add an item
   * to. Saying so beats a button that fails on press.
   */
  if (mode === "store-managed") {
    return (
      <div className="shrink-0 border-t border-border bg-card px-4 py-3 text-sm text-muted-foreground sm:px-5">
        Your plan is billed through the app store, so add-ons have to be bought
        there too.
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 sm:px-5">
      <p className="text-sm tabular">
        <span className="font-medium">
          {selected.length} {selected.length === 1 ? "add-on" : "add-ons"}{" "}
          selected
        </span>
        <span className="text-muted-foreground"> · ${monthly}/month</span>
        {mode === "in-place" && (
          <span className="block text-xs text-muted-foreground">
            {nextInvoice
              ? `Added to your next invoice on ${nextInvoice} — nothing to pay now.`
              : "Added to your next invoice — nothing to pay now."}
          </span>
        )}
      </p>

      <Button
        className="rounded-[9px]"
        disabled={busy}
        onClick={() => void confirm()}
      >
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        {busy
          ? mode === "in-place"
            ? "Adding…"
            : "Opening checkout…"
          : mode === "in-place"
            ? "Add to my plan"
            : "Continue to checkout"}
      </Button>
    </div>
  );
}
