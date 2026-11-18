"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { Images, Landmark, Loader2, Paperclip, Pencil, Plus, Shield, Upload } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssetRegistryDialog } from "@/components/assets/asset-registry-dialog";
import { MatchDialog } from "@/components/assets/match-dialog";
import {
  attachAssetIdAtom,
  bulkUndoAssetMatchIdsAtom,
  deleteAssetIdAtom,
  deleteAssetIdsAtom,
  assetSelectionAtom,
  editAssetAfterUndoAtom,
  undoAssetMatchIdAtom,
  viewAssetIdAtom,
} from "@/lib/atoms";
import { formatBytes } from "@/lib/expenses";
import {
  assetMoney,
  assetOwing,
  assetValue,
  canEditAsset,
  formatAssetDate,
  gstBreakdown,
  type AssetFile,
  type AssetPhotoSlot,
} from "@/lib/assets";
import { apiErrorMessage } from "@/lib/api-error";
import { localIsoToday } from "@/lib/asset-validation";
import { documentTax } from "@/lib/country-context";
import { useCountryContext } from "@/hooks/use-country-context";
import { useAssetInsuranceQuery } from "@/hooks/use-asset-insurance-query";
import { AssetFileTile, FilePreviewDialog } from "@/components/assets/asset-files";
import { useAssetAccess } from "@/components/assets/asset-access";
import {
  useAttachAssetDocumentMutation,
  useDeleteAssetsMutation,
} from "@/hooks/use-asset-mutations";
import {
  useBulkUndoAssetMatchMutation,
  useUndoAssetCashPaymentMutation,
  useUndoAssetMatchMutation,
} from "@/hooks/use-asset-match-query";
import { useAssetQuery } from "@/hooks/use-asset-query";
import { assetUndoKind } from "@/lib/asset-match";
import { Button } from "@/components/ui/button";
import { ASSETS_ROOT } from "@/components/assets/assets-table";
import { useAssetsStore } from "@/stores/assets";

/** Every asset dialog, mounted once by the screen. */
export function AssetDialogs() {
  return (
    <>
      <AssetRegistryDialog />
      <AssetDetailsDialog />
      <AttachDocumentDialog />
      <DeleteAssetDialog />
      <DeleteAssetsDialog />
      <MatchDialog />
      <UndoAssetMatchDialog />
      <BulkUndoAssetMatchDialog />
    </>
  );
}

function useAsset(id: string | null) {
  const assets = useAssetsStore((state) => state.assets);
  return id ? assets.find((asset) => asset.id === id) : undefined;
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

const VIEW_PHOTO_SLOTS: { slot: AssetPhotoSlot; label: string }[] = [
  { slot: "photo", label: "Asset photo" },
  { slot: "serial", label: "Serial / model number" },
  { slot: "receipt", label: "Receipt / invoice" },
  { slot: "marks", label: "Identifiable marks" },
];

/** "Expired", "Expires in N days" (≤ 30) or "Active" — the old screens' colour coding. */
function insuranceStatus(endDate: string): { label: string; className: string } {
  if (!endDate) return { label: "No end date", className: "bg-muted text-muted-foreground" };
  // The user's calendar day, not UTC's — a policy ending today isn't expired.
  const today = localIsoToday();
  if (endDate < today) return { label: "Expired", className: "bg-destructive/10 text-destructive" };
  const days = Math.round((Date.parse(endDate) - Date.parse(today)) / 86_400_000);
  if (days <= 30) return { label: `Expires in ${days} day${days === 1 ? "" : "s"}`, className: "bg-warning/10 text-warning" };
  return { label: "Active", className: "bg-success/10 text-success" };
}

function AssetDetailsDialog() {
  const router = useRouter();
  const [id, setId] = useAtom(viewAssetIdAtom);
  const listed = useAsset(id);
  // The detail fetch carries every photo and document's resolved URL; the
  // list's copy is shown while it loads.
  const { data: detail } = useAssetQuery(id ?? undefined);
  const asset = detail ?? listed;
  const access = useAssetAccess();
  // Insurance is an Advanced Assets section — no request for a plan without it.
  const { data: policies = [], isLoading: loadingPolicies } = useAssetInsuranceQuery(
    access.advanced ? (id ?? undefined) : undefined,
  );
  const { country } = useCountryContext();
  const [preview, setPreview] = React.useState<{ file: AssetFile; title?: string } | null>(null);

  const close = () => setId(null);
  const go = (path: string) => {
    close();
    router.push(path);
  };

  const tax = asset ? documentTax(country, asset.purchaseDate) : null;
  const money = asset && tax ? gstBreakdown(asset.costPrice, asset.gst, tax.rate) : null;
  const photos = asset ? VIEW_PHOTO_SLOTS.filter(({ slot }) => asset.photos[slot]) : [];
  const documents = asset?.documents ?? [];

  return (
    <Dialog open={!!id} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {asset && money && tax && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Landmark className="size-4 shrink-0 text-primary" aria-hidden />
                {asset.name}
              </DialogTitle>
              <DialogDescription>
                {asset.category || "—"} · bought from {asset.supplierName || "—"}
              </DialogDescription>
            </DialogHeader>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Price</h3>
              <dl className="space-y-2 text-sm">
                {asset.gst ? (
                  <>
                    <Row label={`Sub-total (ex ${tax.word})`} value={assetMoney(money.subTotal)} />
                    <Row label={tax.word} value={assetMoney(money.gst)} />
                    <Row label={`Price (inc ${tax.word})`} value={assetMoney(money.total)} />
                  </>
                ) : (
                  <>
                    <Row label="Price" value={assetMoney(assetValue(asset))} />
                    <Row label={tax.word} value={`No ${tax.word}`} />
                  </>
                )}
                <Row label="Paid with cash" value={asset.paidWithCash ? "Yes" : "No"} />
                <Row label="Still owing" value={assetOwing(asset) > 0 ? assetMoney(assetOwing(asset)) : "—"} />
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Details</h3>
              <dl className="space-y-2 text-sm">
                <Row label="Purchased" value={formatAssetDate(asset.purchaseDate)} />
                <Row label="Make / brand" value={asset.brand || "—"} />
                <Row label="Asset type" value={asset.assetType || "—"} />
                <Row label="Model no" value={asset.modelNo || "—"} />
                <Row label="Serial no" value={asset.serialNo || "—"} />
                <Row label="Warranty expiry" value={asset.warrantyExpiry ? formatAssetDate(asset.warrantyExpiry) : "—"} />
                <Row label="Test and tag date" value={asset.testAndTagDate ? formatAssetDate(asset.testAndTagDate) : "—"} />
                <Row
                  label="Depreciation"
                  value={
                    asset.depreciation.enabled
                      ? `${asset.depreciation.method}${asset.depreciation.effectiveLife ? ` · ${asset.depreciation.effectiveLife} years` : ""}`
                      : "Not enabled"
                  }
                />
              </dl>
              {asset.identifyingMarks && (
                <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
                  <span className="mb-1 block text-xs font-medium text-foreground">Identifiable marks</span>
                  {asset.identifyingMarks}
                </p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Images className="size-4 text-primary" aria-hidden />
                Photos
              </h3>
              {photos.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {photos.map(({ slot, label }) => {
                    const file = asset.photos[slot] as AssetFile;
                    return <AssetFileTile key={slot} file={file} label={label} onOpen={() => setPreview({ file, title: label })} />;
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No photos added.</p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Paperclip className="size-4 text-primary" aria-hidden />
                Documents
              </h3>
              {documents.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {documents.map((file, index) => (
                    <AssetFileTile key={file.id ?? `${file.name}-${index}`} file={file} onOpen={() => setPreview({ file })} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No documents attached.</p>
              )}
            </section>

            {/* Advanced Assets only, as on the old asset info. */}
            {access.advanced && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <Shield className="size-4 text-primary" aria-hidden />
                  Insurance details
                </h3>
                <Button size="sm" variant="outline" onClick={() => go(`${ASSETS_ROOT}/${asset.id}/insurance`)}>
                  {policies.length > 0 ? "Manage insurance" : (<><Plus />Add insurance</>)}
                </Button>
              </div>
              {loadingPolicies ? (
                <p className="text-sm text-muted-foreground">Loading insurance…</p>
              ) : policies.length > 0 ? (
                <ul className="space-y-2">
                  {policies.map((policy) => {
                    const status = insuranceStatus(policy.endDate);
                    return (
                      <li key={policy.id} className="rounded-md border border-border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{policy.insurerName || "Insurer"}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          <span>Policy no: {policy.policyNumber || "—"}</span>
                          <span>Cover: {policy.coverageAmount ? assetMoney(Number(policy.coverageAmount)) : "—"}</span>
                          <span>Start: {policy.startDate ? formatAssetDate(policy.startDate) : "—"}</span>
                          <span>End: {policy.endDate ? formatAssetDate(policy.endDate) : "—"}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No insurance records yet.
                </p>
              )}
            </section>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={close}>
                Close
              </Button>
              {canEditAsset(asset) && access.canEdit ? (
                <Button onClick={() => go(`${ASSETS_ROOT}/${asset.id}`)}>
                  <Pencil />
                  Edit asset
                </Button>
              ) : null}
            </div>

            <FilePreviewDialog file={preview?.file ?? null} title={preview?.title} onClose={() => setPreview(null)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
      <dt className="text-sm text-foreground">{label}</dt>
      <dd className="max-w-[60%] text-right text-sm font-medium tabular text-foreground">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Attach a document
 * ------------------------------------------------------------------ */

function AttachDocumentDialog() {
  const [id, setId] = useAtom(attachAssetIdAtom);
  const asset = useAsset(id);
  const attachDocument = useAttachAssetDocumentMutation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  const close = () => setId(null);

  return (
    <Dialog open={!!id} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attach document</DialogTitle>
          <DialogDescription>
            Keep the invoice, warranty or manual with{" "}
            {asset?.name ?? "this asset"}.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center outline-none transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Upload className="size-5" />
            )}
          </span>
          <span className="text-sm font-medium">
            {uploading ? "Uploading…" : "Browse for a file"}
          </span>
          <span className="text-xs text-muted-foreground">
            Images or PDF · up to 20MB
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (!file || !id) return;
            const reader = new FileReader();
            reader.onload = async () => {
              setUploading(true);
              try {
                await attachDocument.mutateAsync({
                  assetId: id,
                  file: {
                    dataUrl: String(reader.result),
                    name: file.name,
                    size: file.size,
                  },
                });
                toast.success(`${file.name} attached`);
                close();
              } catch (error) {
                toast.error(apiErrorMessage(error, "Couldn't attach that file"));
              } finally {
                setUploading(false);
              }
            };
            reader.readAsDataURL(file);
          }}
        />

        {asset && asset.documents.length > 0 && (
          <ul className="space-y-1.5">
            {asset.documents.map((file) => (
              <li
                key={file.name}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <Paperclip
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular">
                  {formatBytes(file.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Delete
 * ------------------------------------------------------------------ */

function DeleteAssetDialog() {
  const [id, setId] = useAtom(deleteAssetIdAtom);
  const asset = useAsset(id);
  const deleteAssets = useDeleteAssetsMutation();

  return (
    <AlertDialog open={!!id} onOpenChange={(next) => !next && setId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
          <AlertDialogDescription>
            {asset?.name ?? "This asset"} will be removed from the register,
            along with its photos and documents
            {asset?.inventoryProductId
              ? ", and its linked stock item is deleted from Inventory too — unless that item is already on an invoice, in which case nothing is deleted"
              : ""}
            . This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteAssets.isPending}
            onClick={async () => {
              if (!id) return;
              try {
                const result = await deleteAssets.mutateAsync([id]);
                setId(null);
                if (result.skippedIds.length > 0) {
                  toast.error(
                    `${asset?.name ?? "This asset"} can't be deleted — it's matched to a bank transaction, or its linked stock item is on an invoice.`,
                  );
                } else {
                  toast.success("Asset deleted");
                }
              } catch (error) {
                toast.error(apiErrorMessage(error, "Couldn't delete this asset"));
              }
            }}
          >
            {deleteAssets.isPending && <Loader2 className="size-4 animate-spin" />}
            {deleteAssets.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAssetsDialog() {
  const [ids, setIds] = useAtom(deleteAssetIdsAtom);
  const [, setSelected] = useAtom(assetSelectionAtom);
  const deleteAssets = useDeleteAssetsMutation();
  const assets = useAssetsStore((state) => state.assets);
  const count = ids?.length ?? 0;
  // The server skips matched assets rather than deleting them — said up front.
  const matchedCount = (ids ?? []).filter((id) => {
    const asset = assets.find((entry) => entry.id === id);
    return !!asset && !canEditAsset(asset);
  }).length;

  return (
    <AlertDialog open={!!ids} onOpenChange={(next) => !next && setIds(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count} {count === 1 ? "asset" : "assets"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            They&apos;ll be removed from the register along with their photos
            and documents, and any linked stock item is deleted from Inventory
            too (unless it&apos;s already on an invoice). This can&apos;t be
            undone.
            {matchedCount > 0
              ? ` ${matchedCount} of them ${matchedCount === 1 ? "is" : "are"} matched and will be skipped — undo the match first to delete ${matchedCount === 1 ? "it" : "them"}.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteAssets.isPending}
            onClick={async () => {
              if (!ids) return;
              try {
                const result = await deleteAssets.mutateAsync(ids);
                setIds(null);
                setSelected([]);
                const deletedCount = result.deletedIds.length;
                if (result.skippedIds.length > 0) {
                  toast.error(
                    `${deletedCount} deleted, ${result.skippedIds.length} couldn't be — matched to a bank transaction, or a linked stock item is on an invoice.`,
                  );
                } else {
                  toast.success(
                    `${deletedCount} ${deletedCount === 1 ? "asset" : "assets"} deleted`,
                  );
                }
              } catch (error) {
                toast.error(apiErrorMessage(error, "Couldn't delete those assets"));
              }
            }}
          >
            {deleteAssets.isPending && <Loader2 className="size-4 animate-spin" />}
            {deleteAssets.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Undo, in whichever form the asset needs:
 *
 * - Paid with cash — the cash payment is undone through the paid-with-cash
 *   endpoint, which also removes the cash transaction. The generic undo-match
 *   would leave that transaction orphaned.
 * - Matched to more than one bank transaction — each match is listed and
 *   undone on its own, by its journal entry.
 * - Otherwise the one match is undone.
 */
function UndoAssetMatchDialog() {
  const router = useRouter();
  const [assetId, setAssetId] = useAtom(undoAssetMatchIdAtom);
  const [editAfter, setEditAfter] = useAtom(editAssetAfterUndoAtom);
  const listed = useAsset(assetId);
  // Opened from an edit link before the register has loaded: the asset's own
  // record decides which undo applies (cash or bank match) until it has.
  const { data: detail } = useAssetQuery(listed ? undefined : (assetId ?? undefined));
  const asset = listed ?? detail;
  const undoMatch = useUndoAssetMatchMutation();
  const undoCash = useUndoAssetCashPaymentMutation();
  // Journal entries undone while the picker is open — the register's copy
  // only catches up once it refetches.
  const [undoneEntries, setUndoneEntries] = React.useState<string[]>([]);
  const [pendingEntry, setPendingEntry] = React.useState<string | null>(null);
  // Opened as the first half of an edit: a matched asset can't be edited, so the
  // match is undone first and the edit form follows.
  const editing = assetId !== null && editAfter === assetId;
  const name = asset?.name ?? "This asset";
  const kind = asset ? (assetUndoKind(asset) ?? "match") : "match";
  const entries = (asset?.matchedJournalEntries ?? []).filter(
    (entry) => !undoneEntries.includes(entry.journalEntryId),
  );
  const picking = kind === "match" && entries.length > 1;
  const pending = undoMatch.isPending || undoCash.isPending;
  // Which undo applies isn't known until the asset is.
  const ready = !!asset;

  const close = () => {
    setAssetId(null);
    setEditAfter(null);
    setUndoneEntries([]);
    setPendingEntry(null);
  };

  const finish = (id: string, thenEdit: boolean) => {
    close();
    if (thenEdit) router.push(`${ASSETS_ROOT}/${id}`);
  };

  const undoOne = async () => {
    if (!assetId) return;
    const id = assetId;
    const thenEdit = editing;
    try {
      if (kind === "cash") {
        await undoCash.mutateAsync(id);
        toast.success("Cash payment undone");
      } else {
        await undoMatch.mutateAsync({
          assetId: id,
          journalEntryId: entries[0]?.journalEntryId,
        });
        toast.success("Match undone");
      }
      finish(id, thenEdit);
    } catch (error) {
      toast.error(
        apiErrorMessage(
          error,
          kind === "cash"
            ? "Couldn't undo this cash payment"
            : "Couldn't undo this match",
        ),
      );
      close();
    }
  };

  const undoEntry = async (journalEntryId: string) => {
    if (!assetId) return;
    const id = assetId;
    const thenEdit = editing;
    setPendingEntry(journalEntryId);
    try {
      await undoMatch.mutateAsync({ assetId: id, journalEntryId });
      toast.success("Match undone");
      const left = entries.length - 1;
      // The edit only opens once nothing is left matched — with matches still
      // on it the asset isn't editable yet.
      if (left <= 0) {
        finish(id, thenEdit);
      } else {
        setUndoneEntries((current) => [...current, journalEntryId]);
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't undo this match"));
    } finally {
      setPendingEntry(null);
    }
  };

  const title =
    kind === "cash"
      ? editing
        ? "Undo cash payment to edit?"
        : "Undo cash payment?"
      : picking
        ? "Undo which match?"
        : editing
          ? "Undo match to edit?"
          : "Undo this match?";

  const description =
    kind === "cash"
      ? `${editing ? "A paid asset can't be edited — undo the payment first. " : ""}${name} is no longer recorded as paid with cash: the cash payment and its cash transaction are removed, and it goes back to showing as unmatched.`
      : picking
        ? `${name} is matched to ${entries.length} bank transactions. Undo the ones that shouldn't be there — each is removed from the reconciliation on its own.`
        : editing
          ? `A matched asset can't be edited — undo the match first. ${name} goes back to showing as unmatched and the reconciliation against its bank transaction is removed, so your BAS figures will change.`
          : `${name} goes back to showing as unmatched, and the reconciliation against its bank transaction is removed.`;

  return (
    <AlertDialog
      open={!!assetId}
      onOpenChange={(next) => {
        if (next || pending) return;
        close();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {picking && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {entries.map((entry) => (
              <li
                key={entry.journalEntryId}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium">
                    {entry.description ||
                      (entry.bankTransactionId
                        ? `Transaction #${entry.bankTransactionId}`
                        : "Bank transaction")}
                  </p>
                  <p className="text-xs text-muted-foreground tabular">
                    {entry.matchedAt
                      ? `${formatAssetDate(entry.matchedAt.slice(0, 10))} · `
                      : ""}
                    {assetMoney(entry.amount)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  disabled={pending}
                  onClick={() => undoEntry(entry.journalEntryId)}
                >
                  {pendingEntry === entry.journalEntryId && (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  {pendingEntry === entry.journalEntryId ? "Undoing…" : "Undo"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {picking ? "Done" : "Cancel"}
          </AlertDialogCancel>
          {!picking && (
            <AlertDialogAction
              disabled={pending || !ready}
              onClick={(event) => {
                // Stays open, reading "Undoing…", until the server answers.
                event.preventDefault();
                void undoOne();
              }}
            >
              {pending
                ? "Undoing…"
                : kind === "cash"
                  ? editing
                    ? "Undo and edit"
                    : "Undo cash payment"
                  : editing
                    ? "Undo and edit"
                    : "Undo match"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BulkUndoAssetMatchDialog() {
  const [ids, setIds] = useAtom(bulkUndoAssetMatchIdsAtom);
  const [, setSelected] = useAtom(assetSelectionAtom);
  const bulkUndoMatch = useBulkUndoAssetMatchMutation();
  const count = ids?.length ?? 0;

  return (
    <AlertDialog open={!!ids} onOpenChange={(next) => !next && setIds(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Undo {count} {count === 1 ? "match" : "matches"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            These assets go back to showing as unmatched, and their
            reconciliation against a bank transaction is removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={bulkUndoMatch.isPending}
            onClick={async () => {
              if (!ids) return;
              try {
                const result = await bulkUndoMatch.mutateAsync(ids);
                setIds(null);
                setSelected([]);
                if (result.failed.length > 0) {
                  toast.error(
                    `${result.succeeded.length} undone, ${result.failed.length} couldn't be.`,
                  );
                } else {
                  toast.success(
                    `${result.succeeded.length} ${result.succeeded.length === 1 ? "match" : "matches"} undone`,
                  );
                }
              } catch (error) {
                toast.error(apiErrorMessage(error, "Couldn't undo those matches"));
              }
            }}
          >
            {bulkUndoMatch.isPending ? "Undoing…" : "Undo matches"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
