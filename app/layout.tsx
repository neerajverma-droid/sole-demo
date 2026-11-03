import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";

import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import ScrollToTop from "@/components/layout/scroll-to-top";


// Third-party Imports
import { NuqsAdapter } from 'nuqs/adapters/next/app'

// Same key sole-webapp's own address autocomplete loads this from — one
// script for the whole app rather than per-form, so every address field
// shares the one loaded `google.maps.places` instance.
const GOOGLE_MAPS_SCRIPT_URL =
  "https://maps.googleapis.com/maps/api/js?key=" +
  (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACE_API) +
  "&libraries=places&v=weekly";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sole",
  description: "Accounting for Australian sole traders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-AU"
      className={plusJakartaSans.variable}
      data-scroll-behavior='smooth'
      suppressHydrationWarning
    >
      <body className="flex min-h-full w-full flex-auto flex-col min-h-svh bg-background font-sans antialiased">
        {/*
          beforeInteractive so `google.maps.places` exists by the time any
          address field's effect runs — Next only allows that strategy from
          the root layout, which is why this lives here rather than nearer
          the form that actually uses it.
        */}
        <Script
          id="google-maps-auth-failure-handler"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.gm_authFailure = function () {
              window.__googleMapsAuthError = "Google Maps authentication failed (invalid key / referrer restriction / billing).";
            };`,
          }}
        />
        <Script
          id="google-maps-script"
          src={GOOGLE_MAPS_SCRIPT_URL}
          strategy="beforeInteractive"
        />
         <NuqsAdapter>
           <Providers>
            {children}
           </Providers>
          </NuqsAdapter>
        <Toaster position="bottom-right" />
        <ScrollToTop />
      </body>
    </html>
  );
}
