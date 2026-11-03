import { Suspense } from "react";
import type { Metadata } from "next";

import { SocialCallback } from "@/components/auth/social-callback";

export const metadata: Metadata = {
  title: "Signing you in · Sole",
};

/**
 * The backend redirects here with the session on the query string, so this page
 * is inherently dynamic — hence the boundary around the component that reads it.
 */
export default function SocialCallbackPage() {
  return (
    <Suspense fallback={null}>
      <SocialCallback />
    </Suspense>
  );
}
