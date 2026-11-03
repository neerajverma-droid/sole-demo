"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSetAtom } from "jotai";
import { toast } from "sonner";

import { ASSETS_ROOT } from "@/components/assets/assets-table";
import { useAssetQuery } from "@/hooks/use-asset-query";
import { editAssetAfterUndoAtom, undoAssetMatchIdAtom } from "@/lib/atoms";

/**
 * Where "Edit this asset" links land (`/assets?edit=<id>`, from the BAS review).
 *
 * A matched asset can't be edited — its amount is what the bank transaction was
 * reconciled against — so a matched one opens the Undo dialog, worded for an
 * edit, and the edit form follows once the match is undone. An asset that isn't
 * matched has nothing to undo and goes straight to the form.
 *
 * Renders nothing. Handles each link once, and clears it from the address so
 * cancelling the dialog doesn't bring it back.
 */
export function AssetEditGate() {
  const router = useRouter();
  const raw = useSearchParams()?.get("edit");
  const id = raw && /^\d+$/.test(raw) ? raw : null;
  const asset = useAssetQuery(id ?? undefined);
  const setUndoId = useSetAtom(undoAssetMatchIdAtom);
  const setEditAfter = useSetAtom(editAssetAfterUndoAtom);
  const handled = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!id || handled.current === id) return;
    if (asset.isError) {
      handled.current = id;
      toast.error("Couldn't open that asset.");
      return;
    }
    if (!asset.data) return;
    handled.current = id;
    if (asset.data.isReconciled) {
      setEditAfter(id);
      setUndoId(id);
      // The dialog is driven by state from here, not by the link. Taking
      // `?edit=` off the address means a remount of this screen can't read the
      // same link again and reopen the dialog for an asset that's by then undone.
      router.replace(ASSETS_ROOT);
    } else {
      router.replace(`${ASSETS_ROOT}/${id}`);
    }
  }, [id, asset.data, asset.isError, router, setEditAfter, setUndoId]);

  return null;
}
