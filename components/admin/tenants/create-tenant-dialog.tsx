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
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { useCreateTenantMutation } from "@/hooks/use-admin-tenants-query";
import { BASE_DOMAIN } from "@/lib/api/env";
import { apiErrorMessage } from "@/lib/api-error";
import {
  MAX_SLUG_LENGTH,
  createTenantIssues,
  slugify,
  type CreateTenantInput,
} from "@/lib/admin/tenants";

const EMPTY: CreateTenantInput = {
  name: "",
  slug: "",
  adminEmail: "",
  adminFirstName: "",
  adminLastName: "",
  maxUsers: 10,
};

/**
 * Create a tenant workspace.
 *
 * The slug follows the name until someone edits it by hand, and then it's
 * theirs: retyping the name after correcting the slug shouldn't undo the
 * correction. The address it makes is shown under the field, since "slug"
 * means nothing until you see it in a URL.
 *
 * The admin fields are optional, as on the backend. With an email, that
 * account becomes the tenant's admin, and is created if it doesn't exist.
 */
export function CreateTenantDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new tenant's id, e.g. to open it. */
  onCreated?: (id: string) => void;
}) {
  const create = useCreateTenantMutation();
  const [form, setForm] = React.useState<CreateTenantInput>(EMPTY);
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [maxUsersText, setMaxUsersText] = React.useState(String(EMPTY.maxUsers));

  // Fresh form each time it opens, so a cancelled draft doesn't come back.
  React.useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setSlugEdited(false);
    setSubmitted(false);
    setServerError(null);
    setMaxUsersText(String(EMPTY.maxUsers));
    create.reset();
    // `create` is stable enough for this; resetting on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const issues = submitted ? createTenantIssues(form) : {};

  const update = (patch: Partial<CreateTenantInput>) => {
    setServerError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(createTenantIssues(form)).length > 0 || create.isPending) return;

    create.mutate(form, {
      onSuccess: (tenant) => {
        toast.success(`${tenant.name} created`);
        onOpenChange(false);
        onCreated?.(tenant.id);
      },
      // The backend's own words, inline: "Slug "acme" is already taken." is
      // the one message here people can act on, and a toast would vanish
      // before they'd changed the field it's about.
      onError: (error) =>
        setServerError(apiErrorMessage(error, "The tenant couldn't be created. Try again.")),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New tenant</DialogTitle>
          <DialogDescription>
            A workspace with its own address, branding and seat limit. It starts as active.
          </DialogDescription>
        </DialogHeader>

        <form id="create-tenant" onSubmit={onSubmit} noValidate className="space-y-4">
          <AuthError message={serverError} />

          <Field label="Business name" htmlFor="tenant-name" required error={issues.name}>
            <Input
              id="tenant-name"
              autoFocus
              value={form.name}
              onChange={(event) => {
                const name = event.target.value;
                update(slugEdited ? { name } : { name, slug: slugify(name) });
              }}
              placeholder="Acme Accounting"
              aria-invalid={!!issues.name}
            />
          </Field>

          <Field
            label="Slug"
            htmlFor="tenant-slug"
            required
            error={issues.slug}
            hint={
              form.slug
                ? `Workspace address: ${form.slug}.${BASE_DOMAIN}`
                : "Lowercase letters, numbers and hyphens. It becomes the workspace address."
            }
          >
            <Input
              id="tenant-slug"
              value={form.slug}
              maxLength={MAX_SLUG_LENGTH}
              onChange={(event) => {
                setSlugEdited(true);
                update({ slug: event.target.value.toLowerCase().replace(/\s+/g, "-") });
              }}
              placeholder="acme-accounting"
              className="font-mono"
              spellCheck={false}
              autoCapitalize="none"
              aria-invalid={!!issues.slug}
            />
          </Field>

          <Field
            label="Seat limit"
            htmlFor="tenant-max-users"
            required
            error={issues.maxUsers}
            hint="How many members the tenant can have."
          >
            <Input
              id="tenant-max-users"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={maxUsersText}
              onChange={(event) => {
                setMaxUsersText(event.target.value);
                update({ maxUsers: Number(event.target.value) });
              }}
              className="w-32 tabular"
              aria-invalid={!!issues.maxUsers}
            />
          </Field>

          <fieldset className="space-y-4 rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-medium">
              Tenant admin <span className="font-normal text-muted-foreground">(optional)</span>
            </legend>

            <Field
              label="Admin email"
              htmlFor="tenant-admin-email"
              error={issues.adminEmail}
              hint="An existing account is moved into this tenant; a new address gets a new account."
            >
              <Input
                id="tenant-admin-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={form.adminEmail}
                onChange={(event) => update({ adminEmail: event.target.value })}
                placeholder="owner@acme.com.au"
                aria-invalid={!!issues.adminEmail}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="tenant-admin-first">
                <Input
                  id="tenant-admin-first"
                  autoComplete="off"
                  value={form.adminFirstName}
                  onChange={(event) => update({ adminFirstName: event.target.value })}
                  disabled={!form.adminEmail.trim()}
                />
              </Field>
              <Field label="Last name" htmlFor="tenant-admin-last">
                <Input
                  id="tenant-admin-last"
                  autoComplete="off"
                  value={form.adminLastName}
                  onChange={(event) => update({ adminLastName: event.target.value })}
                  disabled={!form.adminEmail.trim()}
                />
              </Field>
            </div>
          </fieldset>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" form="create-tenant" disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {create.isPending ? "Creating…" : "Create tenant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
