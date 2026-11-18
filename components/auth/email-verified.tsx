"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AuthSuccess } from "@/components/auth/auth-states";
import { ONBOARDING_ROUTE } from "@/lib/api/post-auth";

/**
 * The thank-you once an address is confirmed — by the link in the email or by
 * typing the code, which end in the same place.
 *
 * Says what happens next rather than only that it worked: a new account still
 * owes us its business profile, while an existing one goes straight back in.
 */
export function EmailVerified({ destination }: { destination: string }) {
  const router = useRouter();
  const newAccount = destination === ONBOARDING_ROUTE;

  return (
    <AuthSuccess
      icon={Check}
      title="Thanks for verifying your email"
      description={
        newAccount
          ? "Your email is confirmed and your account is ready. One quick screen for your business details and GST, then you're in."
          : "Your email is confirmed and your account is ready. Pick up right where you left off."
      }
      action={
        <Button
          size="lg"
          className="h-10 w-full"
          onClick={() => router.replace(destination)}
        >
          Continue
        </Button>
      }
    />
  );
}
