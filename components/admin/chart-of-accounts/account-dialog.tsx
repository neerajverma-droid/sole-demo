"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
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
import {
  useCreateAccountMutation,
  useUpdateAccountMutation,
} from "@/hooks/use-admin-chart-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  CAT_TYPES,
  CAT_TYPE_LABELS,
  TAX_ROLES,
  TAX_ROLE_LABELS,
  accountIssues,
  type AccountInput,
  type CatType,
  type ChartAccount,
  type ChartCategory,
  type ChartCountry,
  type TaxRole,
} from "@/lib/admin/chart-of-accounts";

const EVERY_COUNTRY = "__all__";
const NO_ROLE = "__none__";

const empty = (categoryId: number | null): AccountInput => ({
  name: "",
  code: "",
  categoryId,
  countryIso2: null,
  taxRole: null,
  catType: "N",
  labels: {},
});

/**
 * Add or edit one account in the shared chart.
 *
 * The two country fields are the point of this dialog, and they answer
 * different questions. **Offered in** decides whether a business in that
 * country sees the account at all — most accounts are offered everywhere,
 * because "Bank fees" is the same account in Sydney and Johannesburg. **Names**
 * decides what it is called where it is offered, which is what differs: the
 * account a South African business posts output tax to is the same row, called
 * "VAT Collected".
 *
 * An account Sole's own code posts to by id can be renamed and relabelled but
 * not moved to another category — the postings would change which statement
 * section they land in, retroactively.
 */
export function AccountDialog({
  account,
  categories,
  countries,
  defaultCategoryId,
  open,
  onOpenChange,
}: {
  /** null when adding. */
  account: ChartAccount | null;
  categories: ChartCategory[];
  countries: ChartCountry[];
  defaultCategoryId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateAccountMutation();
  const update = useUpdateAccountMutation();
  const saving = create.isPending || update.isPending;

  const [form, setForm] = React.useState<AccountInput>(empty(defaultCategoryId));
  const [submitted, setSubmitted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(
      account
        ? {
            name: account.name,
            code: account.code,
            categoryId: account.categoryId,
            countryIso2: account.countryIso2,
            taxRole: account.taxRole,
            catType: account.catType,
            labels: { ...(account.labels ?? {}) },
          }
        : empty(defaultCategoryId),
    );
    setSubmitted(false);
    setServerError(null);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account, defaultCategoryId]);

  const issues = submitted ? accountIssues(form) : {};
  const patch = (next: Partial<AccountInput>) => {
    setServerError(null);
    setForm((current) => ({ ...current, ...next }));
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(accountIssues(form)).length > 0 || saving) return;

    const onError = (error: unknown) =>
      setServerError(apiErrorMessage(error, "That account couldn't be saved."));
    const onSuccess = () => {
      toast.success(account ? `${form.name.trim()} updated` : `${form.name.trim()} added`);
      onOpenChange(false);
    };

    if (account) update.mutate({ id: account.id, input: form }, { onSuccess, onError });
    else create.mutate(form, { onSuccess, onError });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{account ? `Edit ${account.name}` : "Add an account"}</DialogTitle>
          <DialogDescription>
            One account, shared by every country it&apos;s offered in. Give it a different name per
            country below rather than creating a second one.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Name" htmlFor="account-name" required error={issues.name}>
              <Input
                id="account-name"
                value={form.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="Bank fees"
              />
            </Field>
            <Field label="Code" htmlFor="account-code" required error={issues.code}>
              <Input
                id="account-code"
                value={form.code}
                onChange={(event) => patch({ code: event.target.value })}
                placeholder="404"
                className="tabular"
              />
            </Field>
          </div>

          <Field label="Category" htmlFor="account-category" required error={issues.categoryId}>
            <Select
              value={form.categoryId ? String(form.categoryId) : ""}
              onValueChange={(value) => patch({ categoryId: Number(value) })}
              disabled={account?.protected}
            >
              <SelectTrigger id="account-category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter((category) => !category.deleted)
                  .map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          {account?.protected ? (
            <p className="-mt-2 text-xs text-muted-foreground">
              Sole&apos;s code posts to this account by id ({account.protectedReason}), so it
              can&apos;t move to another category — the postings already made would change which
              statement section they land in.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Offered in"
              htmlFor="account-country"
              hint="Most accounts belong everywhere. Restrict one that only exists under a single country's law."
            >
              <Select
                value={form.countryIso2 ?? EVERY_COUNTRY}
                onValueChange={(value) =>
                  patch({ countryIso2: value === EVERY_COUNTRY ? null : value })
                }
              >
                <SelectTrigger id="account-country">
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
              htmlFor="account-cat-type"
              hint="Personal and Transfer are kept out of the financial statements."
            >
              <Select value={form.catType} onValueChange={(value) => patch({ catType: value as CatType })}>
                <SelectTrigger id="account-cat-type">
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

          <Field
            label="Tax role"
            htmlFor="account-tax-role"
            hint="How the tax engine finds this account. The reports read these roles, not account ids."
          >
            <Select
              value={form.taxRole ?? NO_ROLE}
              onValueChange={(value) => patch({ taxRole: value === NO_ROLE ? null : (value as TaxRole) })}
            >
              <SelectTrigger id="account-tax-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROLE}>Not a tax control account</SelectItem>
                {TAX_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {TAX_ROLE_LABELS[role].label} — {TAX_ROLE_LABELS[role].description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {account?.taxRole ? (
            <p className="-mt-2 text-xs text-muted-foreground">
              This is the {TAX_ROLE_LABELS[account.taxRole].label.toLowerCase()} account. Give the
              role to another account before clearing it here, or the tax return loses the line.
            </p>
          ) : null}

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
              {saving ? "Saving…" : account ? "Save account" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What each country calls this account.
 *
 * Only the countries that need a different word get a row. An empty box means
 * "use the name above", which is the answer for almost every account — so the
 * editor starts empty rather than listing every country with its name copied
 * into it, which would read as five decisions where there are none.
 */
export function NameOverrides({
  countries,
  value,
  fallback,
  onChange,
}: {
  countries: ChartCountry[];
  value: Record<string, string>;
  fallback: string;
  onChange: (next: Record<string, string>) => void;
}) {
  const used = Object.keys(value);
  const available = countries.filter((country) => !used.includes(country.iso2));

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Names per country</p>
          <p className="text-xs text-muted-foreground">
            Leave a country out and it uses &ldquo;{fallback.trim() || "the name above"}&rdquo;.
          </p>
        </div>
        {available.length > 0 ? (
          <Select value="" onValueChange={(iso2) => onChange({ ...value, [iso2]: fallback })}>
            <SelectTrigger className="w-44" aria-label="Add a country name">
              <span className="flex items-center gap-1.5 text-sm">
                <Plus className="size-3.5" aria-hidden />
                Add a country
              </span>
            </SelectTrigger>
            <SelectContent>
              {available.map((country) => (
                <SelectItem key={country.iso2} value={country.iso2}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {used.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No overrides — this account is called the same thing everywhere.
        </p>
      ) : (
        <div className="space-y-2">
          {used.map((iso2) => (
            <div key={iso2} className="flex items-end gap-2">
              <div className="w-28 shrink-0 pb-2 text-sm">
                {countries.find((country) => country.iso2 === iso2)?.name ?? iso2}
              </div>
              <Input
                value={value[iso2]}
                aria-label={`Name in ${iso2}`}
                onChange={(event) => onChange({ ...value, [iso2]: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-0.5 size-9 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove the ${iso2} name`}
                onClick={() => {
                  const next = { ...value };
                  delete next[iso2];
                  onChange(next);
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
