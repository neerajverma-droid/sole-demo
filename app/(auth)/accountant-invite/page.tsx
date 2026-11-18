import { Suspense } from "react";
import type { Metadata } from "next";

import { AccountantInviteScreen } from "@/components/auth/accountant-invite-screen";
import BrandSplashLoader from "@/components/layout/brand-splash-loader";

export const metadata: Metadata = {
  title: "Join Sole · Your accountant invited you",
};

/** The link in an accountant's (SPM) invite email. See AccountantInviteScreen. */
export default function AccountantInvitePage() {
  return (
    <Suspense fallback={<BrandSplashLoader />}>
      <AccountantInviteScreen />
    </Suspense>
  );
}
