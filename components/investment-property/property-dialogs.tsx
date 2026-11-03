"use client";

import * as React from "react";
import { Loader2, TriangleAlert } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRetained, PropertyMoneyInput, usePropertyMoney } from "@/components/investment-property/module-shared";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import {
  useDeletePropertyMutation,
  useDisposePropertyMutation,
} from "@/hooks/use-investment-property-query";
import { apiErrorMessage } from "@/lib/api-error";
import { parseIsoDate } from "@/lib/invoices";
import {
  disposeIssues,
  emptyDisposeDraft,
  type DisposeDraft,
} from "@/lib/investment-property";

export type PropertyTarget = { id: string; name: string; purchaseDate: string };


export function DeletePropertyDialog({
  property,
  onOpenChange,
  onDeleted,
}: {
  property: PropertyTarget | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const deleteProperty = useDeletePropertyMutation();
  const shown = useRetained(property);

  return (
    <AlertDialog open={property !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete property?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes {shown ? `“${shown.name}”` : "this property"} along
            with its loan, income, maintenance and rental schedules. This action can&apos;t be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteProperty.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteProperty.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!property) return;
              deleteProperty.mutate(property.id, {
                onSuccess: () => {
                  toast.success("Property deleted");
                  onOpenChange(false);
                  onDeleted?.();
                },
                onError: (error) =>
                  toast.error(apiErrorMessage(error, "Couldn't delete the property.")),
              });
            }}
          >
            {deleteProperty.isPending && <Loader2 className="animate-spin" />}
            Delete property
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DisposeForm({
  property,
  onClose,
  onDisposed,
}: {
  property: PropertyTarget;
  onClose: () => void;
  onDisposed?: () => void;
}) {
  const money = usePropertyMoney();
  const dispose = useDisposePropertyMutation();
  const [draft, setDraft] = React.useState<DisposeDraft>(() => emptyDisposeDraft());
  const [attempted, setAttempted] = React.useState(false);

  const issues = disposeIssues(draft, property.purchaseDate);
  const issueFor = (key: keyof DisposeDraft) =>
    attempted ? issues.find((issue) => issue.key === key)?.message : undefined;

  const onSubmit = () => {
    setAttempted(true);
    if (issues.length > 0 || dispose.isPending) return;

    dispose.mutate(
      { id: property.id, draft },
      {
        onSuccess: (result) => {
          toast.success("Sale recorded", {
            description: `${result.isGain ? "Capital gain" : "Capital loss"} of ${money(
              Math.abs(result.capitalGain),
            )} before any CGT discount.`,
          });
          onClose();
          onDisposed?.();
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Couldn't record the sale.")),
      },
    );
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex gap-2.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Recording a sale is permanent. The property becomes read-only — it can&apos;t be
            edited, deleted or marked active again — and its rental schedules are stopped.
          </p>
        </div>

        <Field label="Sale date" required error={issueFor("disposalDate")}>
          <DatePicker
            label="Sale date"
            value={draft.disposalDate}
            onChange={(disposalDate) => setDraft((current) => ({ ...current, disposalDate }))}
            fromDate={parseIsoDate(property.purchaseDate)}
          />
        </Field>
        <Field label="Sale price" htmlFor="dispose-price" required error={issueFor("salePrice")}>
          <PropertyMoneyInput
            id="dispose-price"
            label="Sale price"
            value={draft.salePrice}
            onChange={(salePrice) => setDraft((current) => ({ ...current, salePrice }))}
            invalid={!!issueFor("salePrice")}
            placeholder="0.00"
          />
        </Field>
        <Field
          label="Selling costs"
          htmlFor="dispose-costs"
          hint="Agent commission, advertising, legal fees on the sale."
          error={issueFor("sellingCosts")}
        >
          <PropertyMoneyInput
            id="dispose-costs"
            label="Selling costs"
            value={draft.sellingCosts}
            onChange={(sellingCosts) => setDraft((current) => ({ ...current, sellingCosts }))}
            invalid={!!issueFor("sellingCosts")}
            placeholder="0.00"
          />
        </Field>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={onClose} disabled={dispose.isPending}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={dispose.isPending}>
          {dispose.isPending && <Loader2 className="animate-spin" />}
          Record sale
        </Button>
      </DialogFooter>
    </>
  );
}

export function DisposePropertyDialog({
  property,
  onOpenChange,
  onDisposed,
}: {
  property: PropertyTarget | null;
  onOpenChange: (open: boolean) => void;
  onDisposed?: () => void;
}) {
  const shown = useRetained(property);

  return (
    <Dialog open={property !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record sale</DialogTitle>
          <DialogDescription>
            {shown ? `Mark “${shown.name}” as sold and calculate the capital gain.` : ""}
          </DialogDescription>
        </DialogHeader>
        {shown && (
          <DisposeForm
            key={shown.id}
            property={shown}
            onClose={() => onOpenChange(false)}
            onDisposed={onDisposed}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
