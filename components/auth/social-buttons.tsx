"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { API_BASE, API_CONFIGURED, getAuthTenantSlug } from "@/lib/api/env";
import { apiRoutes } from "@/lib/api/routes";
import { getDeviceId } from "@/lib/api/cookies";
import { registerDevice } from "@/lib/api/device";

/**
 * Google and Apple sign-in, driven by the backend.
 *
 * Each button is a plain full-page redirect to the backend's OAuth initiate
 * endpoint. The backend owns the whole handshake — provider consent, identity
 * resolution, user sync — and redirects back to /auth/social-callback with a
 * token pair. Nothing about the provider is handled in this app, which is why
 * there is no SDK here.
 *
 * The marks are inline SVG so they carry the brand colours and need no network
 * request. They are third-party trademarks: using them in production needs each
 * provider's permission and compliance with their sign-in branding guidelines.
 */
export function SocialButtons({ verb = "" }: { verb?: string }) {
  const [redirecting, setRedirecting] = React.useState<string | null>(null);

  const start = async (provider: string) => {
    if (redirecting) return;
    setRedirecting(provider);

    // Without a device id the backend falls back to a shared default device
    // row, and issuing a session against it logs out everyone else sitting on
    // that row. Register this browser first, exactly as the email path does.
    if (!getDeviceId()) {
      // Non-fatal: the backend still has its fallback, and blocking sign-in on
      // a failed registration would be the worse outcome.
      await registerDevice().catch(() => null);
    }

    const params = new URLSearchParams({
      redirect_url: `${window.location.origin}/auth/social-callback`,
      tenant: getAuthTenantSlug(),
    });
    const deviceId = getDeviceId();
    if (deviceId) params.set("device_id", deviceId);

    window.location.href = `${API_BASE}${apiRoutes.auth.oauth(provider)}?${params.toString()}`;
  };

  // No backend configured means the redirect would go nowhere, so the buttons
  // say what they are rather than failing on click.
  if (!API_CONFIGURED) return null;

  return (
    <div className="flex  items-center justify-center gap-4" >
      <Button
        variant="outline"
        size="lg"
        className="h-10 w-full"
        disabled={!!redirecting}
        onClick={() => void start("google")}
      >
        <GoogleMark />
        {redirecting === "google" ? "Redirecting…" : `${verb}  Google`}
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="h-10 w-full"
        disabled={!!redirecting}
        onClick={() => void start("apple")}
      >
        <AppleMark />
        {redirecting === "apple" ? "Redirecting…" : `${verb}  Apple`}
      </Button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.77l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4.01 3.1C6.23 6.87 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d="M17.05 12.54c-.03-2.7 2.2-4 2.3-4.06-1.25-1.83-3.2-2.08-3.9-2.11-1.66-.17-3.24.98-4.08.98-.84 0-2.14-.96-3.52-.93-1.81.03-3.48 1.05-4.41 2.67-1.88 3.26-.48 8.09 1.35 10.73.9 1.29 1.97 2.74 3.38 2.69 1.36-.06 1.87-.88 3.51-.88 1.64 0 2.1.88 3.53.85 1.46-.02 2.38-1.31 3.27-2.61 1.03-1.5 1.46-2.95 1.48-3.02-.03-.01-2.84-1.09-2.87-4.31ZM14.4 4.6c.74-.9 1.24-2.15 1.1-3.4-1.07.05-2.36.72-3.13 1.61-.68.79-1.29 2.06-1.13 3.28 1.2.09 2.42-.61 3.16-1.49Z" />
    </svg>
  );
}
