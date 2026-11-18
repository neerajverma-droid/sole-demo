"use client";

import Image from "next/image";
import { Check, Loader2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GATEWAYS, SOLE_PAY_LOGO_SRC } from "@/lib/payments";

/**
 * Offered on Save & send and Save & print, every fifth invoice, to a business that hasn't
 * connected SolePay. Setting up SolePay leaves the invoice form, so the invoice
 * is saved as a draft first — the caller does that before navigating — and the
 * main button says so, so nobody wonders where the half-written invoice went.
 *
 * Closing it with the X or Escape does nothing: the invoice stays on screen,
 * unsent, and the next Save & send goes straight through.
 */
export function SolePayPromptDialog({
  open,
  onOpenChange,
  onSetUp,
  onSendAnyway,
  settingUp,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves the invoice as a draft, then starts SolePay onboarding. */
  onSetUp: () => void;
  /** Carries on with what was asked for — the send or the print — without SolePay. */
  onSendAnyway: () => void;
  /** The draft is being saved ahead of onboarding. */
  settingUp: boolean;
}) {
  // The features the Payments page lists for SolePay, so the two never drift.
  const features = GATEWAYS.find((entry) => entry.id === "sole-pay")?.features ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => !settingUp && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <Image
            src={SOLE_PAY_LOGO_SRC}
            alt="SolePay"
            width={203}
            height={66}
            unoptimized
            className="mb-2 h-10 w-auto object-contain object-left"
          />
          <DialogTitle>Get paid faster with SolePay</DialogTitle>
          <DialogDescription>
            Let your clients pay this invoice by card, bank transfer or PayTo,
            and Sole will match each payment to the invoice automatically.
          </DialogDescription>
        </DialogHeader>

        {features.length > 0 && (
          <ul className="space-y-2 rounded-lg bg-muted/40 p-4">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                {feature}
              </li>
            ))}
          </ul>
        )}

        {/* Full width and stacked: the main action first. */}
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            className="w-full"
            onClick={onSetUp}
            disabled={settingUp}
          >
            {settingUp ? <Loader2 className="animate-spin" /> : <Zap />}
            {settingUp ? "Saving draft…" : "Set up SolePay & save this in draft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onSendAnyway}
            disabled={settingUp}
          >
            Continue without SolePay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
