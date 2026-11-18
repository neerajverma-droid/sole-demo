"use client";

import * as React from "react";
import { X, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "sole:invoice-solepay-banner-dismissed";

/**
 * A slim prompt across the top of the invoice form for a business that hasn't
 * connected SolePay. The caller decides when it's relevant; this only handles
 * looking right and staying away once it's been closed.
 *
 * "Closed" is a per-browser convenience, so it lives in localStorage and every
 * access is guarded — a private window or blocked storage just shows the
 * banner each time. It starts hidden and is revealed after mount, so a
 * dismissed banner never flashes in before the stored choice is read.
 */
export function SolePayPromoBanner({ onEnable }: { onEnable: () => void }) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage unavailable — it simply comes back next time.
    }
  };

  return (
    <div
      role="region"
      aria-label="SolePay"
      data-usertour="invoice-solepay-banner"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
        aria-hidden
      >
        <Zap className="size-5" />
      </span>

      <div className="min-w-0 flex-1 basis-64 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Get paid faster with SolePay</h2>
          <Badge className="text-[10px] uppercase tracking-wide">
            Low fees
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Accept instant payments via Card, Bank Transfer, and PayTo — connect
          it once and every invoice can collect payment automatically.
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button type="button" size="sm" onClick={onEnable}>
          <Zap />
          Enable SolePay
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label="Dismiss"
          onClick={dismiss}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
