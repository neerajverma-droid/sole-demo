"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Boxes, DollarSign, Loader2, Package } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { HeroHairline } from "@/components/layout/page-header";
import { useCountryContext } from "@/hooks/use-country-context";
import { useInventoryQuery } from "@/hooks/use-inventory-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  QUANTITY_TYPES,
  createInventoryItemApi,
  draftFromItem,
  emptyItemDraft,
  itemIssues,
  marginPerUnit,
  priceError,
  typeFromQuantityLabel,
  updateInventoryItemApi,
  wholeNumberError,
  type ItemDraft,
  type TaxRate,
  type QuantityType,
} from "@/lib/inventory";
import {
  productTaxLabels,
  taxRateOption,
  taxRateOptions,
  type ProductTaxLabels,
} from "@/lib/product-tax";
import { cn } from "@/lib/utils";
import { useInventoryStore } from "@/stores/inventory";
import { activeCurrencySymbol } from "@/lib/country-context";

export function ItemForm({ itemId }: { itemId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // A direct visit to this URL — a refresh, a bookmark, a shared link — can
  // land here before the list has ever loaded; the list screens fetch it too,
  // but React Query dedupes so this costs nothing when they already have.
  const itemsQuery = useInventoryQuery();
  const items = useInventoryStore((state) => state.items);
  const { country } = useCountryContext();
  const taxLabels = productTaxLabels(country);

  const editing = itemId ? items.find((item) => item.id === itemId) : undefined;

  const [draft, setDraft] = React.useState<ItemDraft>(() =>
    editing ? draftFromItem(editing) : emptyItemDraft(),
  );
  /**
   * Backfills the draft once real data arrives late (the direct-visit case
   * above) — guarded by a ref rather than keyed on `editing` itself, since a
   * later background refetch hands back a new object for the same item and
   * must never re-run this and wipe out whatever the user has since typed.
   * Same guard `invoice-editor.tsx` uses for its own late-arriving detail.
   */
  const hydrated = React.useRef(!itemId || !!editing);
  React.useEffect(() => {
    if (hydrated.current || !editing) return;
    hydrated.current = true;
    setDraft(draftFromItem(editing));
  }, [editing]);

  /** A field's error only surfaces once that field itself has been touched —
   * editing the name shouldn't light up every other empty required field. */
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);

  const patch = (values: Partial<ItemDraft>) => {
    setTouched((current) => {
      const next = { ...current };
      for (const key of Object.keys(values)) next[key] = true;
      return next;
    });
    setDraft((current) => ({ ...current, ...values }));
  };

  const issues = itemIssues(draft);
  const issueFor = (key: string) =>
    touched[key]
      ? issues.find((issue) => issue.key === key)?.message
      : undefined;

  const margin = marginPerUnit(draft.costPrice, draft.salePrice);

  const onSave = async () => {
    setSaving(true);
    // Saved as the selects show them: an older row's "GST (10%)" or "GST_10"
    // goes back in this business's own words.
    const saved: ItemDraft = {
      ...draft,
      purchaseTax: taxRateOption(draft.purchaseTax, taxLabels),
      saleTax: taxRateOption(draft.saleTax, taxLabels),
    };
    try {
      if (editing) {
        await updateInventoryItemApi(editing.id, saved);
        toast.success("Item updated");
      } else {
        await createInventoryItemApi(saved);
        toast.success("Item added");
      }
      await queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      router.push("/inventory");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't save that item"));
      setSaving(false);
    }
  };

  // Still waiting on the list's first load — don't flash a blank "Add item"
  // form (with a Save button that would actually create a duplicate) while
  // the real item might still be on its way.
  if (itemId && !editing && (itemsQuery.isLoading || !itemsQuery.isFetched)) {
    return (
      <div className="mx-auto max-w-4xl space-y-6" aria-hidden>
        <Shimmer className="h-8 w-40 rounded-md" />
        <Shimmer className="h-64 w-full rounded-lg border border-border" />
      </div>
    );
  }

  // The list has loaded and this id genuinely isn't in it.
  if (itemId && !editing) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t find that item. It may have been deleted.
        </p>
        <Button variant="outline" asChild>
          <Link href="/inventory">
            <ArrowLeft />
            Back to inventory
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/inventory">
          <ArrowLeft />
          Inventory
        </Link>
      </Button>

      {/* Accent bar plus the Cancel / Save pair — no duplicate footer. */}
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <HeroHairline />
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {editing ? "Edit item" : "Add item"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Fields marked with <span className="text-destructive">*</span> are
              required.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {issues.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {issues.length === 1
                  ? issues[0].message
                  : `${issues.length} fields need attention`}
              </p>
            )}
            <Button variant="outline" asChild>
              <Link href="/inventory">Cancel</Link>
            </Button>
            <Button onClick={onSave} disabled={issues.length > 0 || saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {editing ? "Save changes" : "Save item"}
            </Button>
          </div>
        </div>
      </section>

      <FormSection
        icon={Package}
        title="Item details"
        description="What the item is, and how it appears on an invoice."
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Item name" required error={issueFor("name")}>
          <Input
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
            placeholder="Timber panel — oak"
            aria-invalid={!!issueFor("name")}
            className={cn(
              issueFor("name") &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
        </Field>

        <Field label="SKU / Item code">
          <Input
            value={draft.sku}
            onChange={(event) => patch({ sku: event.target.value })}
            placeholder="TMB-OAK"
            className="tabular"
          />
        </Field>

        <Field
          label="Type"
          hint="Set from the quantity type — Items is a Product, anything else is a Service."
        >
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
            {typeFromQuantityLabel(draft.quantityType)}
          </div>
        </Field>

        <Field label="Quantity type" required error={issueFor("quantityType")}>
          <Select
            value={draft.quantityType || undefined}
            onValueChange={(value) =>
              patch({
                quantityType: value as QuantityType,
                type: typeFromQuantityLabel(value as QuantityType),
              })
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
              <SelectValue placeholder="Select quantity type…" />
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
      </FormSection>

      <FormSection
        icon={DollarSign}
        title="Pricing & accounts"
        description="What it costs, what you charge, and where it posts."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <PriceField
            label="Cost price"
            value={draft.costPrice}
            error={priceError(draft.costPrice)}
            onChange={(value) => patch({ costPrice: value })}
          />
          <PriceField
            label="Sale price"
            value={draft.salePrice}
            error={priceError(draft.salePrice) ?? issueFor("salePrice")}
            onChange={(value) => patch({ salePrice: value })}
          />

          <Field label="Purchase tax rate">
            <TaxSelect
              label="Purchase tax rate"
              value={draft.purchaseTax}
              labels={taxLabels}
              onChange={(value) => patch({ purchaseTax: value })}
            />
          </Field>
          <Field label="Sale tax rate">
            <TaxSelect
              label="Sale tax rate"
              value={draft.saleTax}
              labels={taxLabels}
              onChange={(value) => patch({ saleTax: value })}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="Asset account category"
              hint="Always Inventory — the only account a tracked item can post to."
            >
              <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                {draft.assetCategory}
              </div>
            </Field>
          </div>

          <Field label="Purchase description">
            <Textarea
              rows={2}
              value={draft.purchaseDescription}
              onChange={(event) =>
                patch({ purchaseDescription: event.target.value })
              }
            />
          </Field>
          <Field label="Sale description">
            <Textarea
              rows={2}
              value={draft.saleDescription}
              onChange={(event) =>
                patch({ saleDescription: event.target.value })
              }
            />
          </Field>
        </div>

        {/* Only once both prices are valid and non-zero. */}
        {margin && (
          <p className="rounded-md bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Margin per unit: </span>
            <span className="font-semibold tabular">
              {margin.amount} ({margin.percent}%)
            </span>
          </p>
        )}
      </FormSection>

      <FormSection
        icon={Boxes}
        title="Tracking"
        description="Whether Sole keeps a stock count for this item."
      >
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={draft.tracked}
            onCheckedChange={(checked) => patch({ tracked: checked === true })}
            className="mt-0.5"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">I track this item</span>
            <span className="block text-xs text-muted-foreground">
              Keep a stock count and warn you when it runs low.
            </span>
          </span>
        </label>

        {draft.tracked && (
          <div className="grid gap-4 sm:grid-cols-2">
            <WholeNumberField
              label="Opening stock"
              value={draft.openingStock}
              error={
                wholeNumberError(draft.openingStock) ?? issueFor("openingStock")
              }
              onChange={(value) => patch({ openingStock: value })}
            />
            <WholeNumberField
              label="Low stock alert at"
              value={draft.lowStockAlert}
              error={
                wholeNumberError(draft.lowStockAlert) ??
                issueFor("lowStockAlert")
              }
              onChange={(value) => patch({ lowStockAlert: value })}
            />
          </div>
        )}
      </FormSection>
    </div>
  );
}

/** Whatever label the row was stored with, shown as one of this business's options. */
function TaxSelect({
  label,
  value,
  labels,
  onChange,
}: {
  label: string;
  value: TaxRate;
  labels: ProductTaxLabels;
  onChange: (value: TaxRate) => void;
}) {
  return (
    <Select value={taxRateOption(value, labels)} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {taxRateOptions(labels).map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PriceField({
  label,
  required,
  value,
  error,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} required={required} error={error}>
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

function WholeNumberField({
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
    <Field label={label} required error={error}>
      <Input
        value={value}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        aria-label={label}
        aria-invalid={!!error}
        className={cn(
          "tabular",
          error && "border-destructive focus-visible:ring-destructive",
        )}
      />
    </Field>
  );
}
