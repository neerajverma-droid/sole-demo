import type { Metadata } from "next";

import { NotFoundScreen } from "@/components/layout/not-found-screen";

export const metadata: Metadata = {
  title: "Page not found · Sole",
  robots: { index: false, follow: false },
};

/**
 * Every URL that matches no route, and every `notFound()` call — the app has
 * one root layout, so this one file covers both.
 */
export default function NotFound() {
  return <NotFoundScreen />;
}
