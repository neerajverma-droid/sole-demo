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
import { PasswordField } from "@/components/auth/password-field";
import { FeatureChecklist } from "@/components/admin/access/feature-checklist";
import { useCreateAdminUserMutation } from "@/hooks/use-admin-users-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  MIN_ADMIN_PASSWORD,
  createAdminIssues,
  type CreateAdminInput,
} from "@/lib/admin/admin-users";

const EMPTY: CreateAdminInput = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  featureKeys: [],
};

/**
 * Create a delegated admin account.
 *
 * The person doesn't sign up — this makes the account with a password, and
 * they sign in at the admin sign-in with it. So the password is the one thing
 * that has to be handed over, and the dialog says so. Sections can be granted
 * here in the same request, or left for later from the list.
 */
export function CreateAdminDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateAdminUserMutation();
  const [form, setForm] = React.useState<CreateAdminInput>(EMPTY);
  const [submitted, setSubmitted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setSubmitted(false);
    setServerError(null);
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const issues = submitted ? createAdminIssues(form) : {};

  const update = (patch: Partial<CreateAdminInput>) => {
    setServerError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(createAdminIssues(form)).length > 0 || create.isPending) return;

    create.mutate(form, {
      onSuccess: (admin) => {
        toast.success(`Admin account created for ${admin.email}`, {
          description: "Share the password with them securely. They sign in at /admin/login.",
        });
        onOpenChange(false);
      },
      onError: (error) =>
        setServerError(apiErrorMessage(error, "The admin account couldn't be created. Try again.")),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New admin</DialogTitle>
          <DialogDescription>
            Creates an account that can sign in to the admin area and open only the sections you tick.
          </DialogDescription>
        </DialogHeader>

        <form id="create-admin" onSubmit={onSubmit} noValidate className="space-y-5">
          <AuthError message={serverError} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="admin-first">
              <Input
                id="admin-first"
                autoComplete="off"
                value={form.firstName}
                onChange={(event) => update({ firstName: event.target.value })}
              />
            </Field>
            <Field label="Last name" htmlFor="admin-last">
              <Input
                id="admin-last"
                autoComplete="off"
                value={form.lastName}
                onChange={(event) => update({ lastName: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Email" htmlFor="admin-new-email" required error={issues.email}>
            <Input
              id="admin-new-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={form.email}
              onChange={(event) => update({ email: event.target.value })}
              placeholder="name@soleapp.com.au"
              aria-invalid={!!issues.email}
            />
          </Field>

          <PasswordField
            id="admin-new-password"
            label="Password"
            value={form.password}
            onChange={(password) => update({ password })}
            error={issues.password}
            hint={`At least ${MIN_ADMIN_PASSWORD} characters. You'll need to share it with them.`}
            autoComplete="new-password"
            placeholder="Choose a password"
          />

          <div className="space-y-4 border-t border-border pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Sections they can open</p>
                <p className="text-xs text-muted-foreground">
                  Optional. You can change these at any time from the list.
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular">
                {form.featureKeys.length === 0
                  ? "None selected"
                  : `${form.featureKeys.length} selected`}
              </span>
            </div>
            <FeatureChecklist
              idPrefix="new-admin"
              columns={2}
              value={form.featureKeys}
              disabled={create.isPending}
              onChange={(keys, checked) =>
                update({
                  featureKeys: checked
                    ? [...new Set([...form.featureKeys, ...keys])]
                    : form.featureKeys.filter((key) => !keys.includes(key)),
                })
              }
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="create-admin" disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {create.isPending ? "Creating…" : "Create admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
