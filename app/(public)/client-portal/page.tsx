import type { Metadata } from "next";

import { ClientPortalScreen } from "@/components/proposals/client-portal/client-portal-screen";

export const metadata: Metadata = {
  title: "Your proposal · Sole",
  description: "Review your proposal and accept or decline it.",
  // A token-keyed page for one client — nothing here should be indexed.
  robots: { index: false, follow: false },
};

const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

/**
 * The link sole-ocr emails with every sent proposal
 * (`${FRONTEND_URL}/client-portal?client_id=…&proposal_id=…&email=…&token=…`,
 * see buildResponseUrl), and where Stripe returns with `checkout=…`.
 *
 * Public — outside the app shell and its auth guard. Only `token` is used;
 * the other params are there for readability.
 */
export default async function ClientPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; checkout?: string | string[] }>;
}) {
  const { token, checkout } = await searchParams;
  return <ClientPortalScreen token={first(token)} checkout={first(checkout)} />;
}
