"use client";

import * as React from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Field } from "@/components/documents/field";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";

const READ_ONLY_TEMPLATE_NOTE =
  "Default templates are shared with every account and can't be changed — save your own copy instead.";

/**
 * Parking the current invoice as a reusable starting point.
 *
 * Asks for exactly what sole-webapp's own dialog asks for: a name. Industry
 * and general-vs-NDIS aren't a second question here — the invoice being
 * saved already answers both, the same way its own template card would.
 *
 * When the draft was opened *from* a saved template, this defaults to
 * overwriting that one — the common case, tweaking a starting point and
 * saving the tweak — with "Save as new" as the explicit way out. A shared
 * default template (`sourceReadOnly`) belongs to no one, so for those the
 * update option stays visible but disabled, and saving always makes a copy.
 *
 * Shared by the invoice and quote editors: each passes its own create and
 * update calls, and the gallery query its save should refresh.
 */
export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  noun = "invoice",
  itemsIssue,
  onCreate,
  onUpdate,
  invalidateKeys,
  sourceTemplateId,
  sourceCategory,
  sourceReadOnly = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What's being saved — "invoice" or "quote" — for the copy. */
  noun?: string;
  /** Why the draft can't become a template yet (e.g. no filled line), if it can't. */
  itemsIssue?: string;
  onCreate: (category: string) => Promise<unknown>;
  onUpdate: (templateId: string, category: string) => Promise<unknown>;
  /** The gallery lists this save should show up in without a manual refresh. */
  invalidateKeys: QueryKey[];
  /** Set when this document was opened from a saved template. */
  sourceTemplateId?: string;
  sourceCategory?: string;
  /** The source is a shared default template — it can be copied, never updated. */
  sourceReadOnly?: boolean;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [category, setCategory] = React.useState("");
  const [mode, setMode] = React.useState<"update" | "new">("update");
  const [saving, setSaving] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCategory(sourceTemplateId ? (sourceCategory ?? "") : "");
    setMode(sourceReadOnly ? "new" : "update");
    setSubmitted(false);
  }, [open, sourceTemplateId, sourceCategory, sourceReadOnly]);

  const categoryIssue = !category.trim()
    ? "Template name is required."
    : undefined;
  const blocked = !!categoryIssue || !!itemsIssue;
  const issueFor = (issue: string | undefined) => (submitted ? issue : undefined);

  const updating = !!sourceTemplateId && !sourceReadOnly && mode === "update";

  const save = async () => {
    setSubmitted(true);
    if (blocked) return;

    setSaving(true);
    try {
      if (updating) {
        await onUpdate(sourceTemplateId, category);
      } else {
        await onCreate(category);
      }
      await Promise.all(
        invalidateKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      toast.success(updating ? `${category} updated` : `${category} saved as a template`);
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't save that template. Try again."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Keep the client and lines as a starting point for next time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Template name" required error={issueFor(categoryIssue)}>
            <Input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="e.g. Monthly retainer"
              autoFocus
              aria-invalid={!!issueFor(categoryIssue)}
              className={cn(
                issueFor(categoryIssue) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>

          {sourceTemplateId && (
            <Field label={`This ${noun} was opened from a template`}>
              <RadioGroup
                value={mode}
                onValueChange={(value) => setMode(value as "update" | "new")}
                className="gap-2"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label
                      className={cn(
                        "flex items-start gap-2.5 rounded-md border border-border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/50",
                        sourceReadOnly
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer",
                      )}
                    >
                      <RadioGroupItem
                        value="update"
                        className="mt-0.5"
                        disabled={sourceReadOnly}
                      />
                      <span>
                        <span className="font-medium">Update the template</span>
                        <span className="block text-xs text-muted-foreground">
                          {sourceReadOnly
                            ? "Default templates can't be modified."
                            : <>Overwrite &ldquo;{sourceCategory}&rdquo; with these changes.</>}
                        </span>
                      </span>
                    </label>
                  </TooltipTrigger>
                  {sourceReadOnly && (
                    <TooltipContent className="max-w-64">
                      {READ_ONLY_TEMPLATE_NOTE}
                    </TooltipContent>
                  )}
                </Tooltip>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/50">
                  <RadioGroupItem value="new" className="mt-0.5" />
                  <span>
                    <span className="font-medium">Save as a new template</span>
                    <span className="block text-xs text-muted-foreground">
                      Keeps the original template untouched.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </Field>
          )}

          {issueFor(itemsIssue) && (
            <p className="text-sm text-destructive">{issueFor(itemsIssue)}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving
              ? "Saving…"
              : updating
                ? "Update template"
                : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
