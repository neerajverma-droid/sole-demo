"use client";

import { useAtom } from "jotai";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { accountStageAtom } from "@/lib/atoms";
import type { AccountStage } from "@/lib/dashboard-data";

/**
 * Demo control: flips the dashboard between its new-account and populated
 * states. The README flags this for team confirmation, so it is gated to
 * development and never renders in a production build.
 */
export function PreviewStateToggle() {
  const [stage, setStage] = useAtom(accountStageAtom);

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed bg-card p-3">
      <span className="text-xs font-medium text-muted-foreground">
        Preview state
      </span>
      <Tabs
        value={stage}
        onValueChange={(value) => setStage(value as AccountStage)}
      >
        <TabsList className="h-8">
          <TabsTrigger value="new" className="text-xs">
            New account
          </TabsTrigger>
          <TabsTrigger value="active" className="text-xs">
            With data
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <span className="text-xs text-muted-foreground">
        — the dashboard adapts its focus to the account&apos;s stage. Dev only.
      </span>
    </div>
  );
}
