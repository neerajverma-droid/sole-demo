"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { RuleForm } from "@/components/rules/rule-form";

/**
 * Add / edit a matching rule without leaving the screen it was opened from.
 *
 * The bulk transaction upload's Matching rules step uses this — sole-webapp
 * opened its AddRules form in place there, and navigating to
 * /transactions/rules/:id mid-wizard would throw away the file being imported.
 * The form itself is the same `RuleForm` the rules pages render.
 */
export function RuleFormDialog({
  open,
  ruleId,
  onOpenChange,
}: {
  open: boolean;
  /** The rule to edit; omitted to add a new one. */
  ruleId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No corner X: RuleForm's header has Cancel beside Save, and the X
          would sit on top of Save. */}
      <DialogContent
        hideClose
        className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
      >
        {/* RuleForm carries its own visible heading; these name the dialog. */}
        <DialogTitle className="sr-only">
          {ruleId ? "Edit rule" : "Add rule"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Set the conditions a transaction has to match and what the rule
          assigns to it.
        </DialogDescription>
        {/* Keyed so switching rules (or edit → add) starts from a fresh draft. */}
        {open && (
          <RuleForm
            key={ruleId ?? "new"}
            ruleId={ruleId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
