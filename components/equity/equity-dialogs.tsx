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
  useDeleteEquityAttachmentMutation,
  useDeleteEquityMutation,
  useUndoEquityMatchMutation,
  useUploadEquityAttachmentMutation,
} from "@/hooks/use-equity-query";
import {
  attachEquityIdAtom,
  deleteEquityIdAtom,
  matchEquityIdAtom,
  unmatchEquityIdAtom,
  viewEquityIdAtom,
} from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  equityRemaining,
  fetchEquityDetail,
  formatEquityAmount,
  formatEquityDate,
  formatEquityRemaining,
  MAX_EQUITY_BYTES,
  type Equity,
} from "@/lib/equity";
import { invoiceMoney } from "@/lib/invoices";
import { useEquityStore } from "@/stores/equity";

function useEquity(id: string | null): Equity | undefined {
  const entries = useEquityStore((state) => state.equity);
  return id ? entries.find((entry) => entry.id === id) : undefined;
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

/** Read-only detail, in the same shape the liability dialog uses. */
export function EquityDetailsDialog() {
  const [viewId, setViewId] = useAtom(viewEquityIdAtom);
  const equity = useEquity(viewId);
  // The list row never carries documents — only the detail endpoint does.
  const detailQuery = useQuery({
    queryKey: ["equity-detail", viewId],
    queryFn: () => fetchEquityDetail(viewId as string),
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
          <DialogTitle>Equity details</DialogTitle>
        </DialogHeader>

        {equity && (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{equity.name}</p>
                <Badge
                  variant={
                    equity.status === "Matched" ? "success" : "secondary"
                  }
                >
                  {equity.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{equity.category}</p>
              <p className="text-2xl font-semibold tracking-tight tabular">
                {formatEquityAmount(equity)}
              </p>
            </div>

            <dl className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Row label="Category" value={equity.category} />
              <Row label="Date" value={formatEquityDate(equity.date)} />
              <Row
                label="Settled so far"
                value={invoiceMoney(equity.paidAmount)}
              />
              <Row label="Remaining" value={formatEquityRemaining(equity)} />
              <Row
                label="Paid with cash"
                value={equity.paidWithCash ? "Yes" : "No"}
              />
              <Row
                label="Matched to"
                value={
                  equity.transactionRef ??
                  (equity.status === "Matched" ? "Matched" : "Not matched")
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
 * Attaches a document to an equity entry that already exists — the same
 * upload/delete pair the liability list has, each firing the moment a file is picked or removed
 * rather than waiting on a separate save.
 */
export function AttachEquityDialog() {
  const [attachId, setAttachId] = useAtom(attachEquityIdAtom);
  const equity = useEquity(attachId);
  const uploadAttachment = useUploadEquityAttachmentMutation();
  const deleteAttachment = useDeleteEquityAttachmentMutation();
  // Held only for the "Uploading… <name>" label — the mutation itself
  // doesn't need to know what it's called.
  const [pendingName, setPendingName] = React.useState<string | null>(null);

  // The list row never carries a document — only the detail endpoint does —
  // so this dialog fetches it fresh whenever it opens on an entry.
  const detailQuery = useQuery({
    queryKey: ["equity-detail", attachId],
    queryFn: () => fetchEquityDetail(attachId as string),
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
            {equity
              ? `The statement or paperwork behind ${equity.name}.`
              : "The document behind this entry."}
          </DialogDescription>
        </DialogHeader>

        {equity &&
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
                    { equityId: equity.id, file },
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
                // detached first so an entry never carries two at once.
                if (document) {
                  deleteAttachment.mutate(document.id, {
                    onSuccess: upload,
                    onError: upload,
                  });
                } else {
                  upload();
                }
              }}
              maxBytes={MAX_EQUITY_BYTES}
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

export function DeleteEquityDialog() {
  const [deleteId, setDeleteId] = useAtom(deleteEquityIdAtom);
  const equity = useEquity(deleteId);
  const deleteEquity = useDeleteEquityMutation();

  return (
    <AlertDialog
      open={deleteId !== null}
      onOpenChange={(open) => !open && setDeleteId(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete equity entry?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the entry and its attachment. This action
            can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {equity && (
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{equity.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {equity.category} · {formatEquityDate(equity.date)}
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium tabular">
              {formatEquityAmount(equity)}
            </span>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteEquity.isPending}
            onClick={() => {
              if (!deleteId) return;
              deleteEquity.mutate(deleteId, {
                onSuccess: () => {
                  setDeleteId(null);
                  toast.success("Equity deleted");
                },
                onError: (error) =>
                  toast.error(
                    apiErrorMessage(error, "Failed to delete equity entry."),
                  ),
              });
            }}
          >
            Delete equity
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
 * Reconciling an equity entry against the bank feed — the same modal Super
 * Contributions and Liabilities open for "Match"/"AI Match"
 * (`components/shared/match-transaction-dialog.tsx`), parameterized here for
 * `type: "equity"` so it hits `setMatchEquity`/`setMultipleEquity`.
 */
export function MatchEquityDialog() {
  const [matchId, setMatchId] = useAtom(matchEquityIdAtom);
  const equity = useEquity(matchId);

  const entity: MatchableEntity | null = equity
    ? {
        id: equity.id,
        title: equity.name,
        subtitle: equity.category,
        amount: equity.amount,
        remainingAmount: equityRemaining(equity),
      }
    : null;

  return (
    <MatchTransactionDialog
      type="equity"
      noun="equity entry"
      open={matchId !== null}
      entity={entity}
      onClose={() => setMatchId(null)}
      invalidateQueryKeys={[["equity"]]}
    />
  );
}

/** Undoes a match — sole-webapp's own `undoPaidWithCash` (EquityList.js),
 *  one endpoint the backend uses for undoing either a cash settlement or a
 *  real bank match, keyed off nothing but the entry's own id. */
export function UnmatchEquityDialog() {
  const [unmatchId, setUnmatchId] = useAtom(unmatchEquityIdAtom);
  const equity = useEquity(unmatchId);
  const undoMatch = useUndoEquityMatchMutation();

  return (
    <AlertDialog
      open={unmatchId !== null}
      onOpenChange={(open) => !open && setUnmatchId(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unmatch this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            The entry keeps its amount and attachment, and goes back to offering
            a match. The transaction returns to your review queue.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={undoMatch.isPending}
            onClick={() => {
              if (!equity) return;
              undoMatch.mutate(equity, {
                onSuccess: () => {
                  setUnmatchId(null);
                  toast(`${equity.name} unmatched`);
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
