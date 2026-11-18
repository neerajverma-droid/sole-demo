import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Payments · Sole",
};

/**
 * Payments moved under Transactions, where the nav puts it. Anyone still on the
 * old URL — an open tab, a bookmark from the day it lived here — lands on the
 * page rather than a 404.
 */
export default function PaymentsRedirect() {
  redirect("/transactions/payments");
}
