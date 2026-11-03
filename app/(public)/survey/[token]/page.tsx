import type { Metadata } from "next";

import { SurveyResponseScreen } from "@/components/survey/survey-response-screen";
import { parseInitialRating } from "@/lib/public-survey";

export const metadata: Metadata = {
  title: "Client Survey · Sole",
  description: "Share your feedback.",
  // A token-keyed page for one client — nothing here should be indexed.
  robots: { index: false, follow: false },
};

/**
 * The "share your feedback" link emailed from a completed job
 * (`${SOLE_FRONTEND_URL}/survey/<token>`, see sole-reputation-service's
 * npsWorker). Public — outside the app shell and its auth guard; the token is
 * the only credential.
 */
export default async function SurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ rating?: string }>;
}) {
  const { token } = await params;
  const { rating } = await searchParams;
  return <SurveyResponseScreen token={decodeURIComponent(token)} initialRating={parseInitialRating(rating)} />;
}
