"use client";

import * as React from "react";

import { Shimmer } from "@/components/ui/shimmer";
import { useDashboardDemo } from "@/hooks/use-dashboard-demo";

/**
 * Holds the cards back until it's settled whether they show the sample or the
 * real figures, so the page doesn't flash one and then swap to the other.
 */
export function DashboardDemoGate({ children }: { children: React.ReactNode }) {
  const { mode } = useDashboardDemo();
  if (mode !== "loading") return <>{children}</>;

  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <Shimmer className="h-40 w-full" />
      <Shimmer className="h-48 w-full" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Shimmer className="h-56 w-full lg:col-span-2" />
        <Shimmer className="h-56 w-full" />
      </div>
      <Shimmer className="h-72 w-full" />
    </div>
  );
}
