"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { FileText, Paperclip } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shimmer } from "@/components/ui/shimmer";
import {
  AttachmentUpload,
  type AttachmentUploadStatus,
} from "@/components/shared/attachment-upload";
import {
  MatchTransactionDialog,
  type MatchableEntity,
} from "@/components/shared/match-transaction-dialog";
import {
  useDeleteLiabilityAttachmentMutation,
  useDeleteLiabilityMutation,
  useUndoLiabilityMatchMutation,
  useUploadLiabilityAttachmentMutation,
} from "@/hooks/use-liabilities-query";
import {
  attachLiabilityIdAtom,
  deleteLiabilityIdAtom,
  matchLiabilityIdAtom,
  unmatchLiabilityIdAtom,
  viewLiabilityIdAtom,
} from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  MAX_LIABILITY_BYTES,
  fetchLiabilityDetail,
  formatLiabilityAmount,
  formatLiabilityDate,
  formatLiabilityRemaining,
  liabilityRemaining,
  type Liability,
} from "@/lib/liabilities";
import { invoiceMoney } from "@/lib/invoices";
import { useLiabilitiesStore } from "@/stores/liabilities";
import { activeCountryContext, taxWord } from "@/lib/country-context";

function useLiability(id: string | null): Liability | undefined {
  const liabilities = useLiabilitiesStore((state) => state.liabilities);
  return id ? liabilities.find((entry) => entry.id === id) : undefined;
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

/** Read-only detail, in the same shape the expense dialog uses. */
export function LiabilityDetailsDialog() {
  const [viewId, setViewId] = useAtom(viewLiabilityIdAtom);
  const liability = useLiability(viewId);
  // The list row never carries documents — only the detail endpoint does
  // (sole-webapp's own attachment view fetches it the same way).
  const detailQuery = useQuery({
    queryKey: ["liability-detail", viewId],
    queryFn: () => fetchLiabilityDetail(viewId as string),
    enabled: viewId !== null,
  });
  const documents = detailQuery.data?.documents ?? [];

  return (
    <Dialog
      open={viewId !== null}
      onOpenChange={(open) => !open && setViewId(null)}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Liability details</DialogTitle>
        </DialogHeader>

        {liability && (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{liability.name}</p>
                <Badge
                  variant={
                    liability.status === "Matched" ? "success" : "secondary"
                  }
                >
                  {liability.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {liability.supplierName || "—"}
              </p>
              <p className="text-2xl font-semibold tracking-tight tabular">
                {formatLiabilityAmount(liability)}
              </p>
            </div>

            <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Row label="Category" value={liability.category} />
              <Row label="Date" value={formatLiabilityDate(liability.date)} />
              <Row
                label="Paid so far"
                value={invoiceMoney(liability.paidAmount)}
              />
              <Row
                label="Remaining"
                value={formatLiabilityRemaining(liability)}
              />
              <Row
                label={`${taxWord(activeCountryContext())} included`}
                value={liability.gst ? "Yes" : "No"}
              />
              <Row
                label="Matched to"
                value={
                  liability.transactionRef ??
                  (liability.status === "Matched" ? "Matched" : "Not matched")
                }
              />
            </dl>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Attachments</p>
              {detailQuery.isLoading ? (
                <Shimmer className="h-16 w-16 rounded-md" />
              ) : documents.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={doc.name}
                      className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border surface-subtle transition-opacity hover:opacity-80"
                    >
                      {/\.(png|jpe?g|gif|webp)(\?|$)/i.test(doc.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={doc.url}
                          alt={doc.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <FileText className="size-6 text-muted-foreground" />
                      )}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No attachments</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium tabular">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Attachment
 * ------------------------------------------------------------------ */

/**
 * Attaches a document to a liability that already exists — sole-webapp's own
 * upload/delete pair (`uploadLiabilityAttachment`/`deleteLiabilityAttachment`,
 * LiabilityList.js), each firing the moment a file is picked or removed
 * rather than waiting on a separate save.
 */
export function AttachLiabilityDialog() {
  const [attachId, setAttachId] = useAtom(attachLiabilityIdAtom);
  const liability = useLiability(attachId);
  const uploadAttachment = useUploadLiabilityAttachmentMutation();
  const deleteAttachment = useDeleteLiabilityAttachmentMutation();
  // Held only for the "Uploading… <name>" label — the mutation itself
  // doesn't need to know what it's called.
  const [pendingName, setPendingName] = React.useState<string | null>(null);

  // The list row never carries a document — only the detail endpoint does —
  // so this dialog fetches it fresh whenever it opens on a liability.
  const detailQuery = useQuery({
    queryKey: ["liability-detail", attachId],
    queryFn: () => fetchLiabilityDetail(attachId as string),
    enabled: attachId !== null,
  });
  const document = detailQuery.data?.documents[0] ?? null;
  const preview = document
    ? { dataUrl: document.url, name: document.name, size: 0 }
    : null;

  const status: AttachmentUploadStatus = uploadAttachment.isPending
    ? "uploading"
    : deleteAttachment.isPending
      ? "deleting"
      : "idle";
  const busy = status !== "idle";

  return (
    <Dialog
      open={attachId !== null}
      onOpenChange={(open) => !open && setAttachId(null)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Paperclip className="mr-1.5 inline size-4" aria-hidden />
            Attachment
          </DialogTitle>
          <DialogDescription>
            {liability
              ? `The loan agreement, payroll summary or letter behind ${liability.name}.`
              : "The document behind this liability."}
          </DialogDescription>
        </DialogHeader>

        {liability &&
          (detailQuery.isLoading ? (
            <Shimmer className="h-24 w-full rounded-md" />
          ) : (
            <AttachmentUpload
              receipt={preview}
              status={status}
              pendingName={pendingName ?? undefined}
              onChange={(next) => {
                // A pick is handled by `onFileSelected` below; only a removal
                // needs handling here.
                if (next || !document) return;
                deleteAttachment.mutate(document.id, {
                  onSuccess: () => {
                    toast.success("Document removed");
                    detailQuery.refetch();
                  },
                  onError: (error) =>
                    toast.error(
                      apiErrorMessage(error, "Couldn't remove that document."),
                    ),
                });
              }}
              onFileSelected={(file) => {
                setPendingName(file.name);
                const upload = () =>
                  uploadAttachment.mutate(
                    { liabilityId: liability.id, file },
                    {
                      onSuccess: () => {
                        toast.success("Document attached");
                        detailQuery.refetch();
                      },
                      onError: (error) =>
                        toast.error(
                          apiErrorMessage(
                            error,
                            "Couldn't attach that document.",
                          ),
                        ),
                      onSettled: () => setPendingName(null),
                    },
                  );
                // Replacing one document with another: the old one is
                // detached first so a liability never carries two at once.
                if (document) {
                  deleteAttachment.mutate(document.id, {
                    onSuccess: upload,
                    onError: upload,
                  });
                } else {
                  upload();
                }
              }}
              maxBytes={MAX_LIABILITY_BYTES}
              noun="document"
            />
          ))}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setAttachId(null)}
            disabled={busy}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Delete
 * ------------------------------------------------------------------ */

export function DeleteLiabilityDialog() {
  const [deleteId, setDeleteId] = useAtom(deleteLiabilityIdAtom);
  const liability = useLiability(deleteId);
  const deleteLiability = useDeleteLiabilityMutation();

  return (
    <AlertDialog
      open={deleteId !== null}
      onOpenChange={(open) => !open && setDeleteId(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete liability?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the liability and its attachment. This
            action can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {liability && (
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{liability.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {liability.supplierName} · {liability.category}
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium tabular">
              {formatLiabilityAmount(liability)}
            </span>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteLiability.isPending}
            onClick={() => {
              if (!deleteId) return;
              deleteLiability.mutate(deleteId, {
                onSuccess: () => {
                  setDeleteId(null);
                  toast.success("Liability deleted");
                },
                onError: (error) =>
                  toast.error(
                    apiErrorMessage(error, "Failed to delete liability."),
                  ),
              });
            }}
          >
            Delete liability
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ------------------------------------------------------------------ *
 * Match / unmatch
 * ------------------------------------------------------------------ */

/**
 * Reconciling a liability against the bank feed — the same modal Super
 * Contributions and Equity open for "Match"/"AI Match"
 * (`components/shared/match-transaction-dialog.tsx`), parameterized here for
 * `type: "liability"` so it hits `setMatchLiability`/`setMultipleLiability`.
 */
export function MatchLiabilityDialog() {
  const [matchId, setMatchId] = useAtom(matchLiabilityIdAtom);
  const liability = useLiability(matchId);

  const entity: MatchableEntity | null = liability
    ? {
        id: liability.id,
        title: liability.name,
        subtitle: liability.category,
        amount: liability.amount,
        remainingAmount: liabilityRemaining(liability),
      }
    : null;

  return (
    <MatchTransactionDialog
      type="liability"
      noun="liability"
      open={matchId !== null}
      entity={entity}
      onClose={() => setMatchId(null)}
      invalidateQueryKeys={[["liabilities"]]}
    />
  );
}

/** Undoes a match — sole-webapp's own `handleUndoLiabilityMatchClose`
 *  (LiabilityList.js), posting whichever of `journal_entry_id`/
 *  `bank_transaction_id` the liability actually carries. */
export function UnmatchLiabilityDialog() {
  const [unmatchId, setUnmatchId] = useAtom(unmatchLiabilityIdAtom);
  const liability = useLiability(unmatchId);
  const undoMatch = useUndoLiabilityMatchMutation();

  return (
    <AlertDialog
      open={unmatchId !== null}
      onOpenChange={(open) => !open && setUnmatchId(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unmatch this liability?</AlertDialogTitle>
          <AlertDialogDescription>
            The liability keeps its amount and attachment, and goes back to
            offering a match. The transaction returns to your review queue.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={undoMatch.isPending}
            onClick={() => {
              if (!liability) return;
              undoMatch.mutate(liability, {
                onSuccess: () => {
                  setUnmatchId(null);
                  toast(`${liability.name} unmatched`);
                },
                onError: (error) =>
                  toast.error(
                    apiErrorMessage(error, "Failed to undo the match."),
                  ),
              });
            }}
          >
            Unmatch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
