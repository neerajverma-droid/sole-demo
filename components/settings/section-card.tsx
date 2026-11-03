"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Every settings section is its own card with its own Save in the header —
 * there is no global save at the foot of the page.
 */
export function SectionCard({
  title,
  description,
  dirty,
  saving,
  onSave,
  action,
  children,
}: {
  title: string;
  description: string;
  /** Save stays disabled until this section has unsaved changes. */
  dirty?: boolean;
  /**
   * While the save request is in flight. Separate from `dirty` on purpose —
   * a disabled button alone reads the same whether there's nothing to save
   * or a save is already running, and those are different things to tell
   * someone who just clicked it.
   */
  saving?: boolean;
  onSave?: () => void;
  /** A header control that isn't Save, e.g. a "Change" button. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // Only one section shows at a time, so this is unique on the page.
    <Card data-usertour="settings-section">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-[15px]">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {onSave && (
          <Button
            size="sm"
            disabled={!dirty || saving}
            onClick={onSave}
            className="disabled:pointer-events-auto disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
        {action}
      </CardHeader>
      <CardContent className="space-y-[15px] p-[15px] pt-0">
        {children}
      </CardContent>
    </Card>
  );
}
