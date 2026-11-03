"use client";

import { useAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteRuleMutation } from "@/hooks/use-rules-query";
import { deleteRuleIdAtom } from "@/lib/atoms";
import { useRulesStore } from "@/stores/rules";

export function DeleteRuleDialog() {
  const [deleteId, setDeleteId] = useAtom(deleteRuleIdAtom);
  const rules = useRulesStore((state) => state.rules);
  const deleteRule = useDeleteRuleMutation();
  const deleting = deleteRule.isPending;

  const rule = rules.find((entry) => entry.id === deleteId);

  return (
    <AlertDialog
      open={deleteId !== null}
      onOpenChange={(open) => !open && !deleting && setDeleteId(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete rule?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the matching rule. This action can&apos;t
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Name and type centre-aligned, as the design has it. */}
        {rule && (
          <div className="rounded-md border p-3 text-center">
            <p className="text-sm font-medium">{rule.name}</p>
            <p className="text-xs text-muted-foreground">
              {rule.type} · {rule.categoryName || rule.accountCategoryName}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
            onClick={(event) => {
              // Radix closes the dialog on click by default — held open here
              // so the spinner has somewhere to show while the call is out.
              event.preventDefault();
              if (!deleteId || deleting) return;
              deleteRule.mutate(deleteId, {
                onSuccess: () => {
                  toast.success("Rule deleted");
                  setDeleteId(null);
                },
                onError: (error: Error) =>
                  toast.error(error.message || "Failed to delete rule."),
              });
            }}
          >
            {deleting && <Loader2 className="animate-spin" aria-hidden />}
            {deleting ? "Deleting…" : "Delete rule"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
