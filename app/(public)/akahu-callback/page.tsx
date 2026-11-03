import { Suspense } from "react";
import type { Metadata } from "next";

import { AkahuCallbackPage } from "@/components/banking/akahu-callback-page";

export const metadata: Metadata = {
  title: "Connecting your bank · Sole",
};

/**
 * Akahu's redirect URI — register `<FRONTEND_URL>/akahu-callback` with Akahu
 * (sole_bankfeed's AKAHU_REDIRECT_URI defaults to it). Suspense because the
 * page reads its search params.
 */
export default function AkahuCallback() {
  return (
    <Suspense>
      <AkahuCallbackPage />
    </Suspense>
  );
}
