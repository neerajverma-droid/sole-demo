"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/documents/field";
import { adjustStockIdAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  ADJUST_REASONS,
  adjustStockApi,
  priceError,
  stockLabel,
  stockStatus,
  stockStatusVariant,
  wholeNumberError,
  type StockAdjustReason,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { useInventoryStore } from "@/stores/inventory";
import { activeCurrencySymbol } from "@/lib/country-context";

const NOTE_MAX_LENGTH = 200;

/**
 * Sets stock on hand after a count, a delivery or a breakage.
 *
 * A dialog rather than a trip to the item form: adjusting a count is a different
 * job from editing an item, and the form's pricing and tax fields are noise when
 * all you've done is open a box and find eleven.
 */
export function AdjustStockDialog() {
  const [id, setId] = useAtom(adjustStockIdAtom);
  const queryClient = useQueryClient();
  const items = useInventoryStore((state) => state.items);
  const item = items.find((entry) => entry.id === id);

  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState<
    Exclude<StockAdjustReason, "opening"> | ""
  >("");
  const [unitCost, setUnitCost] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  // Reseeded each time the dialog opens on a (possibly different) item —
  // keyed on `id` rather than `item` itself, since the item's own object
  // reference changes on every background refetch of the list (a write
  // elsewhere invalidates it while this is open). Keying on the object
  // would silently wipe whatever the user was mid-typing on an unrelated
  // refetch, not just when a different item is actually opened.
  React.useEffect(() => {
    if (!item) return;
    setValue(item.openingStock || "0");
    setReason("");
    // Same default sole-webapp's adjust form uses — the item's own current
    // cost, ready to confirm or change rather than typed from scratch.
    setUnitCost(item.costPrice || "");
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const countError = wholeNumberError(value);
  const blank = !value.trim();
  const current = Number(item?.openingStock) || 0;
  const next = Number(value) || 0;
  const unchanged = !blank && !countError && next === current;
  const adding = !blank && !countError && next > current;

  // A unit cost only means anything when stock is being added — it's what
  // the backend uses to recalculate the weighted-average cost, and a
  // decrement never touches that figure.
  const unitCostError = adding ? priceError(unitCost) : undefined;
  const unitCostRequired = adding && !unitCost.trim();

  const canSave =
    !countError &&
    !blank &&
    !unchanged &&
    !!reason &&
    !unitCostError &&
    !unitCostRequired &&
    !saving;

  const step = (by: number) =>
    setValue(String(Math.max(0, (Number(value) || 0) + by)));

  const onSave = async () => {
    if (!item || !reason) return;
    setSaving(true);
    try {
      await adjustStockApi(item.id, next - current, reason, {
        unitCost: adding && unitCost.trim() ? Number(unitCost) : undefined,
        note,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-items"] }),
        // Otherwise an open accordion or drawer for this item keeps showing
        // the ledger as it stood before this save.
        queryClient.invalidateQueries({
          queryKey: ["inventory-history", item.id],
        }),
      ]);
      toast.success(`${item.name} stock set to ${next}`);
      setId(null);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't adjust stock"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={id !== null}
      // Mirrors the Cancel button's disabled={saving} below: Escape and an
      // overlay click both come through here, and without this a close
      // mid-save doesn't cancel the request — it closes the dialog while it's
      // still in flight, and the eventual success handler's setId(null) then
      // closes whatever's been reopened since, possibly a different item.
      onOpenChange={(open) => !open && !saving && setId(null)}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>{item?.name}</DialogDescription>
        </DialogHeader>

        {item && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border surface-subtle p-3">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">On hand now</p>
                <p className="text-sm tabular">{stockLabel(item)}</p>
              </div>
              <Badge variant={stockStatusVariant(stockStatus(item))}>
                {stockStatus(item)}
              </Badge>
            </div>

            <Field label="New count" error={countError} required>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() => step(-1)}
                  disabled={next <= 0}
                  aria-label="One fewer"
                >
                  <Minus />
                </Button>
                <Input
                  className={cn(
                    "tabular",
                    countError &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  aria-label="New stock count"
                  aria-invalid={!!countError}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() => step(1)}
                  aria-label="One more"
                >
                  <Plus />
                </Button>
              </div>
            </Field>

            {/* The movement this represents, so a typo is obvious before saving. */}
            {!countError && !blank && next !== current && (
              <p className="text-xs text-muted-foreground tabular">
                {next > current
                  ? `Adding ${next - current} ${item.quantityType || "units"}`
                  : `Removing ${current - next} ${item.quantityType || "units"}`}
              </p>
            )}

            <Field label="Reason" required>
              <Select
                value={reason}
                onValueChange={(next) =>
                  setReason(next as Exclude<StockAdjustReason, "opening">)
                }
              >
                <SelectTrigger aria-label="Reason for this adjustment">
                  <SelectValue placeholder="Select a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUST_REASONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Only when stock is going up — this is what recalculates the
                item's weighted-average cost, which a decrement never touches. */}
            {adding && (
              <Field
                label="Unit cost"
                required
                error={
                  unitCostError ??
                  (unitCostRequired ? "Enter the unit cost." : undefined)
                }
                hint="Recalculates this item's average cost."
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {activeCurrencySymbol()}
                  </span>
                  <Input
                    value={unitCost}
                    inputMode="decimal"
                    onChange={(event) => setUnitCost(event.target.value)}
                    placeholder="0.00"
                    aria-label="Unit cost"
                    aria-invalid={!!unitCostError || unitCostRequired}
                    className={cn(
                      "pl-7 tabular",
                      (unitCostError || unitCostRequired) &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                </div>
              </Field>
            )}

            <Field label="Note">
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Received from supplier XYZ"
                maxLength={NOTE_MAX_LENGTH}
                aria-label="Note"
              />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setId(null)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!canSave}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Save count
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
