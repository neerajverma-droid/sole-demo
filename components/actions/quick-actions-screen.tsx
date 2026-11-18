"use client";

import { TodayScreen } from "@/components/actions/today/today-screen";
import { useQuickActionsTourDemo } from "@/hooks/use-quick-actions-tour-demo";

/*
 * Quick Actions — the "Today" design: one card at a time, swipe right to
 * approve and left for later, the app's other modules as live tiles, and every
 * detail in a sheet. The cards are built from the business's own `/unibox/*`
 * data and act through the app's existing actions; see `TodayScreen`.
 */
export function QuickActionsScreen() {
  // Sample rows for the guided tour — on while it runs, gone when it ends.
  useQuickActionsTourDemo();
  return <TodayScreen />;
}
