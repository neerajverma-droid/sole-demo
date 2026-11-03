"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PreviewState = "empty" | "data";

/**
 * Demo control from the prototype: flips a screen between its onboarding
 * empty state and its populated state. Visible rather than dev-gated —
 * stakeholders need to show both.
 */
export function PreviewToggle({
  value,
  onChange,
  emptyLabel,
  dataLabel,
}: {
  value: PreviewState;
  onChange: (next: PreviewState) => void;
  emptyLabel: string;
  dataLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground">Preview</span>
      <Tabs value={value} onValueChange={(next) => onChange(next as PreviewState)}>
        <TabsList aria-label="Preview state">
          <TabsTrigger value="empty" className="font-normal data-[state=active]:font-medium">
            {emptyLabel}
          </TabsTrigger>
          <TabsTrigger value="data" className="font-normal data-[state=active]:font-medium">
            {dataLabel}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
