"use client";

import * as React from "react";
import { Check, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { SectionCard } from "@/components/settings/section-card";
import { useSession } from "@/components/auth/session-provider";
import { meetsPasswordRules, setPassword as savePassword } from "@/lib/auth";

/**
 * Password, for an account that hasn't got one.
 *
 * Signing up with a code leaves you with no password at all, which is fine
 * until the day you try to log in with one. Rather than discovering that at the
 * sign-in screen, it can be set here — and the copy says which state the
 * account is in, since "change your password" is a different errand from
 * "you don't have one".
 *
 * Codes keep working either way. A password is an addition, never a migration.
 */
export function SecuritySection() {
  const { user, refresh } = useSession();

  /*
   * Whether this account can already sign in with a password, read off the
   * profile. It can't be inferred from a failed sign-in: the backend's error
   * for "no password set" is indistinguishable from a wrong one, which is why
   * the profile carries the answer.
   */
  const [hasPassword, setHasPassword] = React.useState(
    () => user?.has_password ?? true,
  );

  React.useEffect(() => {
    if (typeof user?.has_password === "boolean")
      setHasPassword(user.has_password);
  }, [user]);

  const [open, setOpen] = React.useState(false);
  /** Required by the backend only when one is already set. */
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [edited, setEdited] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const passwordIssue = !edited
    ? undefined
    : !password
      ? "Choose a password."
      : !meetsPasswordRules(password)
        ? "Your password doesn't meet the requirements below yet."
        : undefined;

  const confirmationIssue = !edited
    ? undefined
    : !confirmation
      ? "Re-enter your password."
      : confirmation !== password
        ? "Both passwords must match."
        : undefined;

  // Only an account that already has one can be asked for it, which is also
  // the only case the backend requires it in.
  const currentIssue =
    edited && hasPassword && !currentPassword
      ? "Enter your current password."
      : undefined;

  const submittable =
    meetsPasswordRules(password) &&
    confirmation === password &&
    (!hasPassword || !!currentPassword);

  const close = () => {
    setOpen(false);
    setCurrentPassword("");
    setPassword("");
    setConfirmation("");
    setEdited(false);
  };

  const save = async () => {
    setEdited(true);
    if (!submittable || saving) return;

    setSaving(true);
    const result = await savePassword({
      password,
      ...(hasPassword ? { current_password: currentPassword } : {}),
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    // The profile is what the rest of the app reads, so it's re-read rather
    // than patched locally.
    void refresh();
    setHasPassword(true);
    close();
    toast.success(
      hasPassword
        ? "Password updated"
        : "Password set — you can now log in with it",
    );
  };

  return (
    <SectionCard
      title="Password"
      description={
        hasPassword
          ? "Sign in with your password or with an emailed code — both work."
          : "You sign in with an emailed code. Add a password if you'd rather use one."
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-[15px]">
        <p className="flex items-center gap-2.5 text-sm">
          <span
            className={
              hasPassword
                ? "grid size-9 shrink-0 place-items-center rounded-full bg-success/10 text-success"
                : "grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
            }
            aria-hidden
          >
            {hasPassword ? (
              <Check className="size-4" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block font-medium">
              {hasPassword ? "Password set" : "No password yet"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {hasPassword
                ? "Codes still work whenever you'd rather not type it."
                : "Emailed codes are working fine — this is optional."}
            </span>
          </span>
        </p>

        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <KeyRound />
            {hasPassword ? "Change password" : "Set a password"}
          </Button>
        )}
      </div>

      {open && (
        <form
          noValidate
          className="space-y-[15px] rounded-lg border border-border p-[15px]"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {hasPassword && (
            <PasswordField
              id="current-password"
              label="Current password"
              value={currentPassword}
              onChange={(value) => {
                setEdited(true);
                setCurrentPassword(value);
              }}
              error={currentIssue}
              autoComplete="current-password"
              placeholder="Enter your current password"
            />
          )}

          <PasswordField
            id="new-password"
            label={hasPassword ? "New password" : "Password"}
            value={password}
            onChange={(value) => {
              setEdited(true);
              setPassword(value);
            }}
            error={passwordIssue}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          >
            <PasswordStrengthMeter value={password} />
          </PasswordField>

          <PasswordField
            id="confirm-new-password"
            label="Confirm password"
            value={confirmation}
            onChange={(value) => {
              setEdited(true);
              setConfirmation(value);
            }}
            error={confirmationIssue}
            autoComplete="new-password"
            placeholder="Type it again"
          />

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {saving
                ? "Saving…"
                : hasPassword
                  ? "Update password"
                  : "Set password"}
            </Button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}
