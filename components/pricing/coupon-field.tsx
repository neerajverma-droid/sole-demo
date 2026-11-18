"use client";

import * as React from "react";
import { Check, Loader2, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { useCouponCode } from "@/hooks/use-coupon-code";
import { describeCoupon } from "@/lib/subscription";
import { cn } from "@/lib/utils";

/**
 * The coupon box beside the total.
 *
 * Folded to a line of text until it has something to show — a code the account
 * signed up with opens it already Applied — because most people have no code
 * and a field they'll never fill is height the one-screen plan page can't
 * spare. The code is checked before checkout (`Apply`, or Enter) so a typo is
 * caught here rather than after the redirect; the check and its wording are the
 * same ones Settings → Subscription uses.
 */
export function CouponField({
  coupon,
  disabled = false,
  className,
}: {
  coupon: ReturnType<typeof useCouponCode>;
  /** Checkout is being started — nothing here should change under it. */
  disabled?: boolean;
  className?: string;
}) {
  const [opened, setOpened] = React.useState(false);
  const { code, setCode, result, checking, verify } = coupon;
  const trimmed = code.trim();
  const applied = result?.valid === true;
  // The discount alone, not the code with it: the code is in the box above,
  // and the line has to stay one line (and the footer one row) to fit the page.
  const status = result?.valid
    ? describeCoupon(result.discount)
    : (result?.message ?? null);

  if (!opened && !trimmed) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => setOpened(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <Tag className="size-3.5" aria-hidden />
          Have a coupon code?
        </button>
      </div>
    );
  }

  return (
    <div className={cn("w-full space-y-1 sm:w-64", className)}>
      <div className="flex gap-2">
        <Input
          id="plan-coupon"
          aria-label="Coupon code"
          value={code}
          placeholder="Coupon code"
          autoFocus={opened && !trimmed}
          autoComplete="off"
          disabled={disabled}
          aria-invalid={!!result && !result.valid}
          className="h-8 min-w-0 uppercase placeholder:normal-case"
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            // Enter checks the code, never submits: the page's own button is the
            // one that opens Stripe.
            if (event.key === "Enter") {
              event.preventDefault();
              void verify(code);
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !trimmed || checking || applied}
          onClick={() => void verify(code)}
        >
          {checking && <Loader2 className="animate-spin" aria-hidden />}
          {applied ? "Applied" : "Apply"}
        </Button>
      </div>

      {/* One line, whichever it is — the footer row it sits in doesn't grow. */}
      <p
        role="status"
        title={status ?? undefined}
        className={cn(
          "min-h-4 truncate text-xs",
          result?.valid
            ? "flex items-center gap-1.5 font-medium text-success"
            : result
              ? "text-destructive"
              : "text-muted-foreground",
        )}
      >
        {result?.valid ? (
          <>
            <Check className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{status}</span>
          </>
        ) : (
          (status ?? "Checked before you're sent to payment.")
        )}
      </p>
    </div>
  );
}
