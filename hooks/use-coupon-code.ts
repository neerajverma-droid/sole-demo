"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiErrorMessage } from "@/lib/api-error";
import {
  fetchAccountCoupon,
  resolveCheckoutCoupon,
  validateCoupon,
  type CouponCheck,
} from "@/lib/subscription";

/**
 * The coupon box on a page that opens a Stripe checkout.
 *
 * It opens with the code the account already holds — the one typed at sign-up,
 * or FITREC for a Fitrec member — checked and Applied, so a person who arrived
 * with a code pays what they were promised without having to find the box.
 * Settings → Subscription does the same with its own copy of this logic.
 *
 * `couponForCheckout` is what a page calls on its way to Stripe: the code to
 * send, or `null` when checkout must not go ahead (the box already says why).
 */
export function useCouponCode() {
  const [code, setCode] = React.useState("");
  /** The last check — only counts while it's for the code in the box. */
  const [check, setCheck] = React.useState<CouponCheck | null>(null);
  const [checking, setChecking] = React.useState(false);

  const trimmed = code.trim();
  const result = check?.code === trimmed ? check : null;

  const verify = React.useCallback(
    async (value: string): Promise<CouponCheck | null> => {
      const next = value.trim();
      if (!next) return null;
      setChecking(true);
      try {
        const checked = await validateCoupon(next);
        setCheck(checked);
        return checked;
      } catch (error) {
        toast.error(apiErrorMessage(error, "Couldn't check that code. Try again."));
        return null;
      } finally {
        setChecking(false);
      }
    },
    [],
  );

  const accountCoupon = useQuery({
    queryKey: ["subscription", "account-coupon"],
    queryFn: fetchAccountCoupon,
    // A missing profile isn't worth retrying for: the box is simply empty.
    retry: false,
  });

  /*
   * Once, and never over something typed meanwhile — the profile can land after
   * a person has already started on a code of their own.
   */
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    const held = accountCoupon.data;
    if (!held || prefilled.current) return;
    prefilled.current = true;
    setCode((current) => current || held);
    void verify(held);
  }, [accountCoupon.data, verify]);

  const couponForCheckout = React.useCallback(async (): Promise<string | null> => {
    try {
      const resolved = await resolveCheckoutCoupon(code, result);
      setCheck(resolved.check);
      if (!resolved.proceed) {
        toast.error(resolved.check.message);
        return null;
      }
      return resolved.code;
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't check that code. Try again."));
      return null;
    }
  }, [code, result]);

  return {
    code,
    setCode,
    /** The check for the code in the box, or null while it hasn't been checked. */
    result,
    checking,
    verify,
    couponForCheckout,
  };
}
