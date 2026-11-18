"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";
import type { BulkDeleteResult } from "@/lib/planner-api";

/**
 * Which rows of a planner list are ticked.
 *
 * Held per list and only ever counting ids still in it: a row that was deleted,
 * or that a refetch dropped, can't stay "selected" and be sent in the next
 * delete. Switching tabs unmounts the list, which starts the selection afresh.
 */
export function usePlannerSelection(ids: string[]) {
  const [selected, setSelected] = React.useState<string[]>([]);

  const chosen = selected.filter((id) => ids.includes(id));
  const allChosen = ids.length > 0 && chosen.length === ids.length;

  return {
    chosen,
    allChosen,
    isChosen: (id: string) => chosen.includes(id),
    toggle: (id: string) =>
      setSelected((current) =>
        current.includes(id)
          ? current.filter((entry) => entry !== id)
          : [...current, id],
      ),
    toggleAll: () => setSelected(allChosen ? [] : ids),
    clear: () => setSelected([]),
  };
}

/**
 * The line above each tab's list: what the tab is, and the button that adds to
 * it. The same on every tab, so Goals, Budget and Business planner read alike.
 *
 * The button is only passed once the list has something in it — an empty tab
 * already carries its own "start here" button, and two for one action is noise.
 */
export function PlannerTabHeader({
  description,
  action,
}: {
  description: string;
  action?: { label: string; href: string; usertour?: string };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{description}</p>
      {action && (
        <Button
          variant="outline"
          size="sm"
          asChild
          data-usertour={action.usertour}
        >
          <Link href={action.href}>
            <Plus />
            {action.label}
          </Link>
        </Button>
      )}
    </div>
  );
}

/**
 * The bar that appears while rows are ticked, and the confirmation behind its
 * Delete. Delete is the only bulk action a planner list has.
 *
 * Owns the confirm/pending state and the toasts so each list only says what to
 * call. Held open while the request is out — Radix would otherwise close the
 * dialog before it resolved — and the selection is cleared only on success, so
 * a failed delete leaves the same rows ticked to try again.
 */
export function PlannerBulkDelete({
  chosen,
  noun,
  plural,
  consequence,
  deleteIds,
  onDone,
  onClear,
}: {
  chosen: string[];
  /** "goal" / "budget" / "expense plan" — and the plural, which isn't always +s. */
  noun: string;
  plural: string;
  /** What else happens, in a sentence — shown in the confirmation. */
  consequence: string;
  deleteIds: (ids: string[]) => Promise<BulkDeleteResult>;
  /** After a successful delete, so the list can drop its selection. */
  onDone: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  if (chosen.length === 0 && !open) return null;

  const label = (count: number) => `${count} ${count === 1 ? noun : plural}`;

  const confirm = async () => {
    if (pending || chosen.length === 0) return;
    setPending(true);
    try {
      const { deletedIds, notFoundIds } = await deleteIds(chosen);
      toast.success(`${label(deletedIds.length)} deleted`, {
        description:
          notFoundIds.length > 0
            ? `${label(notFoundIds.length)} couldn't be found — already deleted.`
            : undefined,
      });
      setOpen(false);
      onDone();
    } catch (error) {
      toast.error(
        apiErrorMessage(error, `Couldn't delete the selected ${plural}.`),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.03] px-4 py-2.5">
          <p className="text-sm font-medium tabular">
            {chosen.length} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setOpen(true)}
            >
              <Trash2 />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onClear}
            >
              <X />
              Clear
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={open}
        onOpenChange={(next) => !next && !pending && setOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label(chosen.length)}?</AlertDialogTitle>
            <AlertDialogDescription>
              {consequence} This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void confirm();
              }}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
