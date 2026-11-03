"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { productDialogAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  ITEM_TRANSACTION_TYPES,
  QUANTITY_TYPES,
  createInventoryItemApi,
  draftFromItem,
  itemIncludesGst,
  priceError,
  updateInventoryItemApi,
  withGst,
  type ItemDraft,
  type ItemTransactionType,
  type QuantityType,
} from "@/lib/inventory";
import { emptyCustomItemDraft, productIssues } from "@/lib/products";
import { documentTax } from "@/lib/country-context";
import { productTaxLabels } from "@/lib/product-tax";
import { INDUSTRIES, type Industry } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useActiveBusinessIndustry } from "@/hooks/use-active-business-industry";
import { useCountryContext } from "@/hooks/use-country-context";
import { useInventoryStore } from "@/stores/inventory";
import { activeCurrencySymbol } from "@/lib/country-context";

/** Create and edit in one dialog — the fields are identical either way. */
export function ProductDialog() {
  const [dialog, setDialog] = useAtom(productDialogAtom);
  const queryClient = useQueryClient();
  const items = useInventoryStore((state) => state.items);
  const industry = useActiveBusinessIndustry();
  const { country } = useCountryContext();
  const docTax = documentTax(country);
  const taxLabels = productTaxLabels(country);

  const editing = dialog.editId
    ? items.find((item) => item.id === dialog.editId)
    : undefined;

  /**
   * Seeded from the whole record, not just the fields shown. This is a
   * sales-facing slice of the same catalogue entry Inventory edits, so cost
   * price's siblings — purchase tax, asset account and the stock figures — have to
   * ride along untouched. Saving here must not wipe what Inventory owns.
   */
  const [draft, setDraft] = React.useState<ItemDraft>(() =>
    emptyCustomItemDraft(industry),
  );
  /** A field's error only surfaces once that field itself has been touched —
   * editing the name shouldn't light up every other empty required field. */
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);

  // Re-seed each time it opens, so a cancelled edit can't leak into the next one.
  React.useEffect(() => {
    if (!dialog.open) return;
    setDraft(editing ? draftFromItem(editing) : emptyCustomItemDraft(industry));
    setTouched({});
  }, [dialog.open, dialog.editId, editing, industry]);

  const patch = (values: Partial<ItemDraft>) => {
    setTouched((current) => {
      const next = { ...current };
      for (const key of Object.keys(values)) next[key] = true;
      return next;
    });
    setDraft((current) => ({ ...current, ...values }));
  };

  const issues = productIssues(draft);
  const issueFor = (key: string) =>
    touched[key] ? issues.find((issue) => issue.key === key)?.message : undefined;

  const close = () => setDialog({ open: false, editId: null });

  const onSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await updateInventoryItemApi(editing.id, draft);
        toast.success(`${draft.name.trim()} updated`);
      } else {
        await createInventoryItemApi(draft);
        toast.success(`${draft.name.trim()} added`);
      }
      await queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      close();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't save that product"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      // Same guard as the Cancel button (disabled={saving}, below): Escape and
      // an overlay click both route through here too, and without this a
      // close mid-save doesn't stop the request — it just closes the dialog
      // out from under it, so the save's own success handler later calls
      // close() again and yanks shut whatever's been reopened in the
      // meantime, possibly a different item's edit.
      onOpenChange={(open) => !open && !saving && close()}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${editing.name}` : "Create custom product"}
          </DialogTitle>
          <DialogDescription>
            Fields marked with <span className="text-destructive">*</span> are
            required.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" required error={issueFor("name")}>
              <Input
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="Consulting hour"
                aria-invalid={!!issueFor("name")}
                className={cn(
                  issueFor("name") &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </Field>
          </div>

          <Field
            label="Quantity type"
            required
            error={issueFor("quantityType")}
          >
            <Select
              value={draft.quantityType || undefined}
              onValueChange={(value) =>
                patch({ quantityType: value as QuantityType })
              }
            >
              <SelectTrigger
                aria-label="Quantity type"
                aria-invalid={!!issueFor("quantityType")}
                className={cn(
                  issueFor("quantityType") &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              >
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {QUANTITY_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Transaction type"
            required
            error={issueFor("transactionType")}
          >
            <Select
              value={draft.transactionType}
              onValueChange={(value) =>
                patch({ transactionType: value as ItemTransactionType })
              }
            >
              <SelectTrigger aria-label="Transaction type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_TRANSACTION_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea
                rows={2}
                value={draft.saleDescription}
                onChange={(event) =>
                  patch({ saleDescription: event.target.value })
                }
                placeholder="Shown on the invoice or quote line"
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Industry">
              <Select
                value={draft.industry}
                onValueChange={(value) => patch({ industry: value as Industry })}
              >
                <SelectTrigger aria-label="Industry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <PriceField
            label="Cost price"
            value={draft.costPrice}
            error={priceError(draft.costPrice) ?? issueFor("costPrice")}
            onChange={(value) => patch({ costPrice: value })}
          />
          <PriceField
            label="Selling price"
            value={draft.salePrice}
            error={priceError(draft.salePrice) ?? issueFor("salePrice")}
            onChange={(value) => patch({ salePrice: value })}
          />

          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Include {docTax.word}</p>
                <p className="text-xs text-muted-foreground">
                  Applies {docTax.rate}% {docTax.word} when this is added to a
                  document.
                </p>
              </div>
              <Switch
                checked={itemIncludesGst(draft)}
                onCheckedChange={(checked) =>
                  patch({ saleTax: withGst(checked, taxLabels) })
                }
                aria-label={`Include ${docTax.word}`}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          {issues.length > 0 && (
            <p className="mr-auto self-center text-xs text-muted-foreground">
              {issues.length === 1
                ? issues[0].message
                : `${issues.length} fields need attention`}
            </p>
          )}
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={issues.length > 0 || saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            {editing ? "Save changes" : "Create product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} error={error}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {activeCurrencySymbol()}
        </span>
        <Input
          value={value}
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
          placeholder="0.00"
          aria-label={label}
          aria-invalid={!!error}
          className={cn(
            "pl-7 tabular",
            error && "border-destructive focus-visible:ring-destructive",
          )}
        />
      </div>
    </Field>
  );
}
