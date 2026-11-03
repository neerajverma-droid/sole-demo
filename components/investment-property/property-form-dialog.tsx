"use client";

import * as React from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { Textarea } from "@/components/ui/textarea";
import { AddressAutocomplete } from "@/components/documents/address-autocomplete";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { PropertyMoneyInput } from "@/components/investment-property/module-shared";
import {
  useCreatePropertyMutation,
  usePropertyQuery,
  useUpdatePropertyMutation,
} from "@/hooks/use-investment-property-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  OWNERSHIP_ENTITIES,
  PROPERTY_TYPES,
  TAX_TREATMENTS,
  draftFromProperty,
  emptyPropertyDraft,
  propertyIssues,
  type PropertyDraft,
} from "@/lib/investment-property";
import { cn } from "@/lib/utils";

type OptionCard<T extends string> = { value: T; label: string; hint: string };

function OptionCards<T extends string>({
  name,
  value,
  options,
  onChange,
  columns,
}: {
  name: string;
  value: T;
  options: readonly OptionCard<T>[];
  onChange: (next: T) => void;
  columns: string;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as T)}
      aria-label={name}
      className={cn("grid gap-3", columns)}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border p-3.5 transition-colors hover:bg-muted/40",
            value === option.value && "border-primary ring-1 ring-primary",
          )}
        >
          <span className="space-y-1">
            <span className="block text-sm font-medium">{option.label}</span>
            <span className="block text-xs leading-relaxed text-muted-foreground">
              {option.hint}
            </span>
          </span>
          <RadioGroupItem value={option.value} aria-label={option.label} className="mt-0.5" />
        </label>
      ))}
    </RadioGroup>
  );
}

function PropertyFormFields({
  initial,
  propertyId,
  onClose,
  onSaved,
}: {
  initial: PropertyDraft;
  propertyId?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const createProperty = useCreatePropertyMutation();
  const updateProperty = useUpdatePropertyMutation();
  const [draft, setDraft] = React.useState<PropertyDraft>(initial);
  const [touched, setTouched] = React.useState<Partial<Record<keyof PropertyDraft, boolean>>>({});
  const [attempted, setAttempted] = React.useState(false);

  const saving = createProperty.isPending || updateProperty.isPending;
  const issues = propertyIssues(draft);
  const issueFor = (key: keyof PropertyDraft) =>
    attempted || touched[key] ? issues.find((issue) => issue.key === key)?.message : undefined;

  const patch = (values: Partial<PropertyDraft>) => {
    setTouched((current) => ({
      ...current,
      ...Object.fromEntries(Object.keys(values).map((key) => [key, true])),
    }));
    setDraft((current) => ({ ...current, ...values }));
  };

  const onSave = () => {
    setAttempted(true);
    if (issues.length > 0 || saving) return;

    if (propertyId) {
      updateProperty.mutate(
        { id: propertyId, draft },
        {
          onSuccess: () => {
            toast.success("Property updated");
            onSaved?.(propertyId);
            onClose();
          },
          onError: (error) => toast.error(apiErrorMessage(error, "Couldn't save the property.")),
        },
      );
      return;
    }

    createProperty.mutate(draft, {
      onSuccess: ({ id }) => {
        toast.success("Property created");
        onSaved?.(id);
        onClose();
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Couldn't create the property.")),
    });
  };

  const invalid = (key: keyof PropertyDraft) =>
    cn(issueFor(key) && "border-destructive focus-visible:ring-destructive");

  return (
    <>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1 py-1">
        <Field label="Property name" htmlFor="property-name" required error={issueFor("name")}>
          <Input
            id="property-name"
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
            placeholder="e.g. Hawthorn Investment Unit"
            aria-invalid={!!issueFor("name")}
            className={invalid("name")}
            maxLength={255}
          />
        </Field>

        <Field label="Property type" required error={issueFor("type")}>
          <Select
            value={draft.type}
            onValueChange={(value) => patch({ type: value as PropertyDraft["type"] })}
          >
            <SelectTrigger
              aria-label="Property type"
              aria-invalid={!!issueFor("type")}
              className={invalid("type")}
            >
              <SelectValue placeholder="Select property type" />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Ownership entity" required>
          <OptionCards
            name="Ownership entity"
            value={draft.ownershipEntity}
            options={OWNERSHIP_ENTITIES}
            onChange={(ownershipEntity) => patch({ ownershipEntity })}
            columns="sm:grid-cols-2"
          />
        </Field>

        <Field label="Property tax treatment" required>
          <OptionCards
            name="Property tax treatment"
            value={draft.taxTreatment}
            options={TAX_TREATMENTS}
            onChange={(taxTreatment) => patch({ taxTreatment })}
            columns="sm:grid-cols-3"
          />
        </Field>

        <Field label="Address" htmlFor="property-address" error={issueFor("address")}>
          <AddressAutocomplete
            id="property-address"
            value={draft.address}
            onChange={(address) => patch({ address })}
            onSelect={() => undefined}
            placeholder="Start typing an address"
            ariaInvalid={!!issueFor("address")}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Purchase date" required error={issueFor("purchaseDate")}>
            <DatePicker
              label="Purchase date"
              value={draft.purchaseDate}
              onChange={(purchaseDate) => patch({ purchaseDate })}
              toDate={new Date()}
            />
          </Field>
          <Field
            label="Purchase price"
            htmlFor="property-price"
            required
            error={issueFor("purchasePrice")}
          >
            <PropertyMoneyInput
              id="property-price"
              label="Purchase price"
              value={draft.purchasePrice}
              onChange={(purchasePrice) => patch({ purchasePrice })}
              invalid={!!issueFor("purchasePrice")}
              placeholder="0.00"
            />
          </Field>
          <Field label="Stamp duty" htmlFor="property-stamp" error={issueFor("stampDuty")}>
            <PropertyMoneyInput
              id="property-stamp"
              label="Stamp duty"
              value={draft.stampDuty}
              onChange={(stampDuty) => patch({ stampDuty })}
              invalid={!!issueFor("stampDuty")}
              placeholder="0.00"
            />
          </Field>
          <Field label="Legal / settlement costs" htmlFor="property-legal" error={issueFor("legalCosts")}>
            <PropertyMoneyInput
              id="property-legal"
              label="Legal / settlement costs"
              value={draft.legalCosts}
              onChange={(legalCosts) => patch({ legalCosts })}
              invalid={!!issueFor("legalCosts")}
              placeholder="0.00"
            />
          </Field>
          <Field
            label="Buyer agent / acquisition costs"
            htmlFor="property-agent"
            error={issueFor("buyerAgentCosts")}
          >
            <PropertyMoneyInput
              id="property-agent"
              label="Buyer agent / acquisition costs"
              value={draft.buyerAgentCosts}
              onChange={(buyerAgentCosts) => patch({ buyerAgentCosts })}
              invalid={!!issueFor("buyerAgentCosts")}
              placeholder="0.00"
            />
          </Field>
          <Field
            label="Current estimated value"
            htmlFor="property-value"
            error={issueFor("currentValue")}
          >
            <PropertyMoneyInput
              id="property-value"
              label="Current estimated value"
              value={draft.currentValue}
              onChange={(currentValue) => patch({ currentValue })}
              invalid={!!issueFor("currentValue")}
              placeholder="0.00"
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="property-notes">
          <Textarea
            id="property-notes"
            value={draft.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            placeholder="e.g. Recently renovated kitchen and bathroom"
            rows={3}
          />
        </Field>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {propertyId ? "Save changes" : "Create property"}
        </Button>
      </DialogFooter>
    </>
  );
}

function EditLoader({
  propertyId,
  onClose,
  onSaved,
}: {
  propertyId: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const query = usePropertyQuery(propertyId);
  const [seed, setSeed] = React.useState<PropertyDraft | null>(null);

  React.useEffect(() => {
    if (seed || !query.data || query.isFetching) return;
    setSeed(draftFromProperty(query.data));
  }, [seed, query.data, query.isFetching]);

  if (query.isError && !seed) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          {apiErrorMessage(query.error, "Couldn't load this property.")}
        </p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!seed) {
    return (
      <div className="space-y-4 py-2" aria-busy>
        <Shimmer className="h-9 w-full" />
        <Shimmer className="h-9 w-full" />
        <Shimmer className="h-24 w-full" />
        <Shimmer className="h-9 w-full" />
      </div>
    );
  }

  return (
    <PropertyFormFields
      initial={seed}
      propertyId={propertyId}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

export function PropertyFormDialog({
  open,
  onOpenChange,
  propertyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  onSaved?: (id: string) => void;
}) {
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{propertyId ? "Edit property" : "Create property"}</DialogTitle>
          <DialogDescription>
            {propertyId
              ? "Update the acquisition and valuation details for this property."
              : "Add the core acquisition and valuation details for this investment property."}
          </DialogDescription>
        </DialogHeader>

        {propertyId ? (
          <EditLoader propertyId={propertyId} onClose={close} onSaved={onSaved} />
        ) : (
          <PropertyFormFields initial={emptyPropertyDraft()} onClose={close} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}
