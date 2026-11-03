import { redirect } from "next/navigation";

/**
 * Payments moved under Transactions, where the nav puts it. Anyone still on the
 * old URL — an open tab, a bookmark from the day it lived here — lands on the
 * page rather than a 404.
 */
export default function PaymentsRedirect() {
  redirect("/transactions/payments");
}
