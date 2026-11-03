"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { Landmark, Loader2, Paperclip, Upload } from "lucide-react";
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
  formatAssetDate,
} from "@/lib/assets";
import {
  useAttachAssetDocumentMutation,
  useDeleteAssetsMutation,
} from "@/hooks/use-asset-mutations";
import {
  useBulkUndoAssetMatchMutation,
  useUndoAssetMatchMutation,
} from "@/hooks/use-asset-match-query";
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

function AssetDetailsDialog() {
  const [id, setId] = useAtom(viewAssetIdAtom);
  const asset = useAsset(id);

  return (
    <Dialog open={!!id} onOpenChange={(next) => !next && setId(null)}>
      <DialogContent className="sm:max-w-lg">
        {asset && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Landmark
                  className="size-4 shrink-0 text-primary"
                  aria-hidden
                />
                {asset.name}
              </DialogTitle>
              <DialogDescription>
                {asset.category} · bought from {asset.supplierName || "—"}
              </DialogDescription>
            </DialogHeader>

            <dl className="space-y-2 text-sm">
              <Row label="Asset value" value={assetMoney(assetValue(asset))} />
              <Row
                label="Still owing"
                value={
                  assetOwing(asset) > 0 ? assetMoney(assetOwing(asset)) : "—"
                }
              />
              <Row
                label="Purchased"
                value={formatAssetDate(asset.purchaseDate)}
              />
              <Row label="Make / brand" value={asset.brand || "—"} />
              <Row label="Asset type" value={asset.assetType} />
              <Row label="Model no" value={asset.modelNo || "—"} />
              <Row label="Serial no" value={asset.serialNo || "—"} />
              <Row
                label="Warranty expiry"
                value={
                  asset.warrantyExpiry
                    ? formatAssetDate(asset.warrantyExpiry)
                    : "—"
                }
              />
              <Row
                label="Depreciation"
                value={
                  asset.depreciation.enabled
                    ? `${asset.depreciation.method}${
                        asset.depreciation.effectiveLife
                          ? ` · ${asset.depreciation.effectiveLife} years`
                          : ""
                      }`
                    : "Not enabled"
                }
              />
              <Row
                label="Documents"
                value={
                  asset.documents.length > 0
                    ? `${asset.documents.length} attached`
                    : "None"
                }
              />
            </dl>

            {asset.identifyingMarks && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                {asset.identifyingMarks}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] text-right text-sm tabular">{value}</dd>
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
                toast.error(
                  error instanceof Error ? error.message : "Couldn't attach that file",
                );
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
            along with its photos and documents. This can&apos;t be undone.
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
                    `${asset?.name ?? "This asset"} can't be deleted — it's reconciled or linked to inventory.`,
                  );
                } else {
                  toast.success("Asset deleted");
                }
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Couldn't delete this asset",
                );
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
  const count = ids?.length ?? 0;

  return (
    <AlertDialog open={!!ids} onOpenChange={(next) => !next && setIds(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count} {count === 1 ? "asset" : "assets"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            They&apos;ll be removed from the register along with their photos
            and documents. This can&apos;t be undone.
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
                    `${deletedCount} deleted, ${result.skippedIds.length} couldn't be — reconciled or linked to inventory.`,
                  );
                } else {
                  toast.success(
                    `${deletedCount} ${deletedCount === 1 ? "asset" : "assets"} deleted`,
                  );
                }
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Couldn't delete those assets",
                );
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

function UndoAssetMatchDialog() {
  const router = useRouter();
  const [assetId, setAssetId] = useAtom(undoAssetMatchIdAtom);
  const [editAfter, setEditAfter] = useAtom(editAssetAfterUndoAtom);
  const asset = useAsset(assetId);
  const undoMatch = useUndoAssetMatchMutation();
  // Opened as the first half of an edit: a matched asset can't be edited, so the
  // match is undone first and the edit form follows.
  const editing = assetId !== null && editAfter === assetId;
  const name = asset?.name ?? "This asset";

  return (
    <AlertDialog
      open={!!assetId}
      onOpenChange={(next) => {
        if (next) return;
        setAssetId(null);
        setEditAfter(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {editing ? "Undo match to edit?" : "Undo this match?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {editing
              ? `A matched asset can't be edited — undo the match first. ${name} goes back to showing as unmatched and the reconciliation against its bank transaction is removed, so your BAS figures will change.`
              : `${name} goes back to showing as unmatched, and the reconciliation against its bank transaction is removed.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={undoMatch.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={undoMatch.isPending}
            onClick={async (event) => {
              // Stays open, reading "Undoing…", until the server answers.
              event.preventDefault();
              if (!assetId) return;
              const id = assetId;
              const thenEdit = editing;
              try {
                await undoMatch.mutateAsync(id);
                toast.success("Match undone");
                setAssetId(null);
                setEditAfter(null);
                if (thenEdit) router.push(`${ASSETS_ROOT}/${id}`);
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Couldn't undo this match",
                );
                setAssetId(null);
                setEditAfter(null);
              }
            }}
          >
            {undoMatch.isPending ? "Undoing…" : editing ? "Undo and edit" : "Undo match"}
          </AlertDialogAction>
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
                toast.error(
                  error instanceof Error ? error.message : "Couldn't undo those matches",
                );
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
