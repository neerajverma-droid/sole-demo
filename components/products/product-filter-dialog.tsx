"use client";

import * as React from "react";
import { useAtom, useAtomValue } from "jotai";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/documents/field";
import {
  generalFiltersAtom,
  ndisFiltersAtom,
  productFilterOpenAtom,
  productFiltersAtom,
  productsTabAtom,
} from "@/lib/atoms";
import {
  ITEM_TRANSACTION_TYPES,
  ITEM_TYPES,
  QUANTITY_TYPES,
  type ItemTransactionType,
  type ItemType,
  type QuantityType,
} from "@/lib/inventory";
import { useNdisQuery } from "@/hooks/use-ndis-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { documentTax } from "@/lib/country-context";
import {
  EMPTY_GENERAL_FILTERS,
  EMPTY_NDIS_FILTERS,
  EMPTY_PRODUCT_FILTERS,
  ndisFilterOptions,
  type GeneralFilters,
  type NdisFilters,
  type ProductFilters,
} from "@/lib/products";

/**
 * Filter By, for whichever catalogue is in front of you.
 *
 * One dialog, three sets of controls: the tabs hold different rows, so they
 * have different things worth narrowing by — the NDIS reference is organised by
 * registration group and support category, which the other two have never heard
 * of. Each edits a local copy so nothing narrows until Apply, and Reset clears
 * the copy rather than the list, so a mis-click can still be cancelled.
 */
export function ProductFilterDialog() {
  const [open, setOpen] = useAtom(productFilterOpenAtom);
  const tab = useAtomValue(productsTabAtom);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        {tab === "General" && (
          <GeneralFilterForm onClose={() => setOpen(false)} />
        )}
        {tab === "NDIS" && <NdisFilterForm onClose={() => setOpen(false)} />}
        {tab === "Custom" && (
          <CustomFilterForm onClose={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The footer every form shares: Reset, Cancel, Apply. */
function FilterFooter({
  onReset,
  onCancel,
  onApply,
}: {
  onReset: () => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <DialogFooter>
      <Button
        variant="ghost"
        className="mr-auto text-muted-foreground"
        onClick={onReset}
      >
        Reset
      </Button>
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button onClick={onApply}>Apply</Button>
    </DialogFooter>
  );
}

/**
 * Show only what carries GST (or the business's own tax). Shared by the two
 * tabs whose rows record a tax rate, so the control and its explanation can't
 * drift apart between them.
 */
function GstSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const { word, rate } = documentTax(useCountryContext().country);
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{word} enabled</p>
        <p className="text-xs text-muted-foreground">
          Show only items that carry {rate}% {word}.
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={`${word} enabled`}
      />
    </div>
  );
}

/** A select over a fixed list of options, with "All" as the do-nothing choice. */
function ChoiceField({
  label,
  value,
  options,
  onChange,
  optionLabel,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  optionLabel?: (option: string) => string;
}) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="All">All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {optionLabel ? optionLabel(option) : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function GeneralFilterForm({ onClose }: { onClose: () => void }) {
  const [applied, setApplied] = useAtom(generalFiltersAtom);
  const [local, setLocal] = React.useState<GeneralFilters>(applied);

  React.useEffect(() => setLocal(applied), [applied]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Filter by</DialogTitle>
        <DialogDescription>
          Narrows the general catalogue for your industry. Prices there are
          indicative; the tax treatment isn&apos;t.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <GstSwitch
          checked={local.gstEnabled}
          onChange={(checked) =>
            setLocal((current) => ({ ...current, gstEnabled: checked }))
          }
        />

        <ChoiceField
          label="Item type"
          value={local.type}
          options={ITEM_TYPES}
          onChange={(value) =>
            setLocal((current) => ({
              ...current,
              type: value as "All" | ItemType,
            }))
          }
        />
        <ChoiceField
          label="Transaction type"
          value={local.transactionType}
          options={ITEM_TRANSACTION_TYPES}
          onChange={(value) =>
            setLocal((current) => ({
              ...current,
              transactionType: value as "All" | ItemTransactionType,
            }))
          }
        />
        <ChoiceField
          label="Quantity type"
          value={local.quantityType}
          options={QUANTITY_TYPES}
          onChange={(value) =>
            setLocal((current) => ({
              ...current,
              quantityType: value as "All" | QuantityType,
            }))
          }
        />
      </div>

      <FilterFooter
        onReset={() => setLocal(EMPTY_GENERAL_FILTERS)}
        onCancel={onClose}
        onApply={() => {
          setApplied(local);
          onClose();
        }}
      />
    </>
  );
}

function NdisFilterForm({ onClose }: { onClose: () => void }) {
  const [applied, setApplied] = useAtom(ndisFiltersAtom);
  const [local, setLocal] = React.useState<NdisFilters>(applied);
  // Read off the live reference list (React Query dedupes against the
  // screen's own fetch), so a refreshed catalogue brings its own groups
  // rather than needing this list edited to match.
  const { data: ndisItems = [] } = useNdisQuery();
  const options = React.useMemo(() => ndisFilterOptions(ndisItems), [ndisItems]);

  React.useEffect(() => setLocal(applied), [applied]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Filter by</DialogTitle>
        <DialogDescription>
          Narrows the NDIS support catalogue the way the NDIA organises it.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <ChoiceField
          label="Registration group"
          value={local.registrationGroup}
          options={options.registrationGroups}
          onChange={(value) =>
            setLocal((current) => ({ ...current, registrationGroup: value }))
          }
        />
        <ChoiceField
          label="Support category"
          value={local.supportCategory}
          options={options.supportCategories}
          onChange={(value) =>
            setLocal((current) => ({ ...current, supportCategory: value }))
          }
          optionLabel={(option) => `Category ${option}`}
        />
      </div>

      <FilterFooter
        onReset={() => setLocal(EMPTY_NDIS_FILTERS)}
        onCancel={onClose}
        onApply={() => {
          setApplied(local);
          onClose();
        }}
      />
    </>
  );
}

function CustomFilterForm({ onClose }: { onClose: () => void }) {
  const [applied, setApplied] = useAtom(productFiltersAtom);
  const [local, setLocal] = React.useState<ProductFilters>(applied);

  React.useEffect(() => setLocal(applied), [applied]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Filter by</DialogTitle>
        <DialogDescription>
          Narrows your custom items. The General and NDIS catalogues have their
          own filters.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <GstSwitch
          checked={local.gstEnabled}
          onChange={(checked) =>
            setLocal((current) => ({ ...current, gstEnabled: checked }))
          }
        />

        <ChoiceField
          label="Transaction type"
          value={local.transactionType}
          options={ITEM_TRANSACTION_TYPES}
          onChange={(value) =>
            setLocal((current) => ({
              ...current,
              transactionType: value as "All" | ItemTransactionType,
            }))
          }
        />
        <ChoiceField
          label="Quantity type"
          value={local.quantityType}
          options={QUANTITY_TYPES}
          onChange={(value) =>
            setLocal((current) => ({
              ...current,
              quantityType: value as "All" | QuantityType,
            }))
          }
        />
      </div>

      <FilterFooter
        onReset={() => setLocal(EMPTY_PRODUCT_FILTERS)}
        onCancel={onClose}
        onApply={() => {
          setApplied(local);
          onClose();
        }}
      />
    </>
  );
}
