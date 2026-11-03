"use client";

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
import { useRetireAccountMutation, useRetireCategoryMutation } from "@/hooks/use-admin-chart-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCount } from "@/lib/admin/format";
import type { ChartAccount, ChartCategory } from "@/lib/admin/chart-of-accounts";

/**
 * Retire an account.
 *
 * "Retire", not "delete", because that is what happens: the row is soft
 * deleted, so every journal line already posted against it still resolves and
 * every report that reads them is unchanged. Calling it Delete would promise
 * something the backend deliberately refuses to do.
 *
 * The posting count is the whole decision. An account with 4,000 postings is in
 * people's books; one with none is a mistake being tidied up. Both are safe,
 * and only one needs thinking about.
 */
export function RetireAccountDialog({
  account,
  onClose,
}: {
  account: ChartAccount | null;
  onClose: () => void;
}) {
  const retire = useRetireAccountMutation();

  return (
    <AlertDialog open={account !== null} onOpenChange={(open) => !open && !retire.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retire {account?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {account && account.postings > 0 ? (
              <>
                It stops being offered for new transactions. The{" "}
                <span className="font-medium text-foreground">
                  {formatCount(account.postings)} {account.postings === 1 ? "posting" : "postings"}
                </span>{" "}
                already made against it stand, and every report that reads them is unchanged. You
                can bring it back at any time.
              </>
            ) : (
              "Nothing has been posted to this account, so retiring it affects no one's books. It stops being offered for new transactions, and you can bring it back at any time."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={retire.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={retire.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!account) return;
              retire.mutate(account.id, {
                onSuccess: (result) => {
                  toast.success(`${account.name} retired`, {
                    description: result.postingsKept
                      ? `${formatCount(result.postingsKept)} existing postings kept.`
                      : undefined,
                  });
                  onClose();
                },
                onError: (error) =>
                  toast.error(apiErrorMessage(error, "That account couldn't be retired.")),
              });
            }}
          >
            {retire.isPending ? "Retiring…" : "Retire account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Retire a category. Only ever offered for an empty one — see the screen. */
export function RetireCategoryDialog({
  category,
  onClose,
}: {
  category: ChartCategory | null;
  onClose: () => void;
}) {
  const retire = useRetireCategoryMutation();

  return (
    <AlertDialog open={category !== null} onOpenChange={(open) => !open && !retire.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retire {category?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The category stops being offered. Nothing is posted directly to a category, so no books
            change, and you can bring it back at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={retire.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={retire.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!category) return;
              retire.mutate(category.id, {
                onSuccess: () => {
                  toast.success(`${category.name} retired`);
                  onClose();
                },
                onError: (error) =>
                  toast.error(apiErrorMessage(error, "That category couldn't be retired.")),
              });
            }}
          >
            {retire.isPending ? "Retiring…" : "Retire category"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
