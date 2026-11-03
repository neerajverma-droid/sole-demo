"use client";

import * as React from "react";
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
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { NameOverrides } from "@/components/admin/chart-of-accounts/account-dialog";
import {
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
} from "@/hooks/use-admin-chart-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  CAT_TYPES,
  CAT_TYPE_LABELS,
  categoryIssues,
  type CatType,
  type CategoryInput,
  type ChartCategory,
  type ChartCountry,
} from "@/lib/admin/chart-of-accounts";

const EVERY_COUNTRY = "__all__";

const empty: CategoryInput = { name: "", countryIso2: null, catType: "N", labels: {} };

/**
 * Add or edit a category — the heading accounts sit under, and the section a
 * statement groups them into.
 *
 * Same two country fields as an account, for the same reason: a category is
 * offered somewhere, and called something there.
 */
export function CategoryDialog({
  category,
  countries,
  open,
  onOpenChange,
}: {
  /** null when adding. */
  category: ChartCategory | null;
  countries: ChartCountry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateCategoryMutation();
  const update = useUpdateCategoryMutation();
  const saving = create.isPending || update.isPending;

  const [form, setForm] = React.useState<CategoryInput>(empty);
  const [submitted, setSubmitted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(
      category
        ? {
            name: category.name,
            countryIso2: category.countryIso2,
            catType: category.catType,
            labels: { ...(category.labels ?? {}) },
          }
        : empty,
    );
    setSubmitted(false);
    setServerError(null);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  const issues = submitted ? categoryIssues(form) : {};
  const patch = (next: Partial<CategoryInput>) => {
    setServerError(null);
    setForm((current) => ({ ...current, ...next }));
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(categoryIssues(form)).length > 0 || saving) return;

    const onError = (error: unknown) =>
      setServerError(apiErrorMessage(error, "That category couldn't be saved."));
    const onSuccess = () => {
      toast.success(category ? `${form.name.trim()} updated` : `${form.name.trim()} added`);
      onOpenChange(false);
    };

    if (category) update.mutate({ id: category.id, input: form }, { onSuccess, onError });
    else create.mutate(form, { onSuccess, onError });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? `Edit ${category.name}` : "Add a category"}</DialogTitle>
          <DialogDescription>
            The heading accounts sit under, and the section a financial statement groups them into.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Name" htmlFor="category-name" required error={issues.name}>
            <Input
              id="category-name"
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Expenses"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Offered in" htmlFor="category-country">
              <Select
                value={form.countryIso2 ?? EVERY_COUNTRY}
                onValueChange={(value) =>
                  patch({ countryIso2: value === EVERY_COUNTRY ? null : value })
                }
              >
                <SelectTrigger id="category-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EVERY_COUNTRY}>Every country</SelectItem>
                  {countries.map((country) => (
                    <SelectItem key={country.iso2} value={country.iso2}>
                      {country.name} only
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Type"
              htmlFor="category-cat-type"
              hint="Personal and Transfer are kept out of the statements."
            >
              <Select value={form.catType} onValueChange={(value) => patch({ catType: value as CatType })}>
                <SelectTrigger id="category-cat-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {CAT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <NameOverrides
            countries={countries}
            value={form.labels}
            fallback={form.name}
            onChange={(labels) => patch({ labels })}
          />

          {serverError ? <AuthError message={serverError} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : category ? "Save category" : "Add category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
