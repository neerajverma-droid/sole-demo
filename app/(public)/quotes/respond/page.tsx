import type { Metadata } from "next";

import { QuoteRespondScreen } from "@/components/quotes/quote-respond-screen";

export const metadata: Metadata = {
  title: "Quote response · Sole",
  description: "Review your quote and accept or decline it.",
  // A token-keyed page for one client — nothing here should be indexed.
  robots: { index: false, follow: false },
};

/**
 * The link sole-ocr emails with every sent quote
 * (`${FRONTEND_URL}/quotes/respond?token=…`, see buildQuoteResponseUrl).
 *
 * Public — outside the app shell and its auth guard. The static `respond`
 * segment takes precedence over `(app)/quotes/[id]`, so this never reaches the
 * quote editor.
 */
export default async function QuoteRespondPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <QuoteRespondScreen token={Array.isArray(token) ? token[0] : token} />
  );
}
