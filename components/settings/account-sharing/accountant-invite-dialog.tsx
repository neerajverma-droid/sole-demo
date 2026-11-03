"use client";

import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/documents/field";
import { DatePicker } from "@/components/documents/date-picker";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useSendAccountantInvite,
  useUpdateAccountantInvite,
} from "@/hooks/use-accountant-access-query";
import { accountantEmailError } from "@/lib/onboarding";
import {
  ACCOUNTANT_ROLES,
  fullAccessPermissions,
  isFullAccess,
  updatePermission,
  type AccountantInvite,
  type AccountantPermissions,
  type PermissionAction,
  type PermissionModule,
} from "@/lib/accountant-access";

const ACTION_COLUMNS: { key: PermissionAction; label: string; tip: string }[] = [
  { key: "view", label: "View", tip: "Grant access to view records in the selected module." },
  {
    key: "add",
    label: "Add",
    tip: "Grant the ability to create new records in the selected module. Granting this access also permits viewing.",
  },
  {
    key: "edit",
    label: "Edit",
    tip: "Grant access to change records in the selected module. Granting this access also permits viewing.",
  },
  {
    key: "delete",
    label: "Delete",
    tip: "Grant the ability to delete records in the selected module. Granting this access also permits viewing.",
  },
];

type FormState = {
  name: string;
  email: string;
  ccType: string;
  endDateIso: string;
  permissions: AccountantPermissions;
};

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  ccType: "",
  endDateIso: "",
  permissions: {},
};

function formFromInvite(invite: AccountantInvite): FormState {
  return {
    name: invite.name,
    email: invite.email,
    ccType: invite.ccType,
    endDateIso: invite.endDateIso,
    permissions: invite.permissions,
  };
}

/**
 * Share access or edit an existing share. Both directions use the same form —
 * only email and role lock once an invite exists, since the backend keys the
 * record on email and the role is a one-time classification.
 */
export function AccountantInviteDialog({
  open,
  invite,
  permissionModules,
  onOpenChange,
}: {
  open: boolean;
  /** Null for a new invite; the record being edited otherwise. */
  invite: AccountantInvite | null;
  permissionModules: PermissionModule[];
  onOpenChange: (open: boolean) => void;
}) {
  const isEditing = invite !== null;
  const sendInvite = useSendAccountantInvite();
  const updateInvite = useUpdateAccountantInvite();
  const saving = sendInvite.isPending || updateInvite.isPending;

  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(invite ? formFromInvite(invite) : EMPTY_FORM);
    setTouched(false);
    setConfirmOpen(false);
  }, [open, invite]);

  const nameIssue =
    touched && form.name.trim().length < 3
      ? "Enter a name of at least 3 characters."
      : undefined;
  const emailIssue = touched ? accountantEmailError(form.email) || (!form.email.trim() ? "Enter an email address." : undefined) : undefined;
  const roleIssue = touched && !isEditing && !form.ccType ? "Choose a role." : undefined;
  const hasAnyPermission = Object.values(form.permissions).some((actions) => actions.length > 0);
  const permissionsIssue = touched && !hasAnyPermission ? "Select at least one permission." : undefined;

  const valid =
    form.name.trim().length >= 3 &&
    !accountantEmailError(form.email) &&
    !!form.email.trim() &&
    (isEditing || !!form.ccType) &&
    hasAnyPermission;

  const fullAccess = isFullAccess(permissionModules, form.permissions);

  const toggleFullAccess = () => {
    setForm((current) => ({
      ...current,
      permissions: fullAccess ? {} : fullAccessPermissions(permissionModules),
    }));
  };

  const toggleAction = (moduleName: string, action: PermissionAction, checked: boolean) => {
    setForm((current) => ({
      ...current,
      permissions: updatePermission(current.permissions, permissionModules, moduleName, action, checked),
    }));
  };

  const submit = async () => {
    setTouched(true);
    if (!valid || saving) return;

    if (isEditing) {
      await updateInvite.mutateAsync({
        id: invite.id,
        payload: { name: form.name, email: form.email, endDateIso: form.endDateIso, permissions: form.permissions },
      });
      onOpenChange(false);
      return;
    }

    if (!confirmOpen) {
      setConfirmOpen(true);
      return;
    }

    await sendInvite.mutateAsync({
      name: form.name,
      email: form.email,
      ccType: form.ccType,
      endDateIso: form.endDateIso,
      permissions: form.permissions,
    });
    setConfirmOpen(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Account detail</DialogTitle>
            <DialogDescription>
              Share access to your account and information with someone else.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-6 flex-1 space-y-6 overflow-y-auto px-6">
            <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="invite-name" required error={nameIssue}>
                <Input
                  id="invite-name"
                  maxLength={255}
                  value={form.name}
                  onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
                />
              </Field>

              <Field
                label="End date"
                htmlFor="invite-end-date"
                hint={!form.endDateIso ? "Leave blank for no expiry." : undefined}
              >
                <DatePicker
                  id="invite-end-date"
                  value={form.endDateIso}
                  onChange={(iso) => setForm((c) => ({ ...c, endDateIso: iso }))}
                  fromDate={new Date()}
                  label="End date"
                />
              </Field>

              <Field label="Email" htmlFor="invite-email" required error={emailIssue}>
                <Input
                  id="invite-email"
                  type="email"
                  maxLength={255}
                  disabled={isEditing}
                  value={form.email}
                  onChange={(event) => setForm((c) => ({ ...c, email: event.target.value }))}
                />
              </Field>

              <Field label="Role" htmlFor="invite-role" required={!isEditing} error={roleIssue}>
                <Select
                  value={form.ccType}
                  disabled={isEditing}
                  onValueChange={(value) => setForm((c) => ({ ...c, ccType: value }))}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNTANT_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Permissions</h3>
                  <p className="text-xs text-muted-foreground">
                    Your invited user can&apos;t access your Settings pages,
                    including Profile and Account Sharing.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={toggleFullAccess}>
                  <ShieldCheck />
                  {fullAccess ? "Clear all" : "Full access"}
                </Button>
              </div>

              {permissionsIssue && (
                <p className="text-xs text-destructive">{permissionsIssue}</p>
              )}

              <Table containerClassName="max-h-72 overflow-auto rounded-lg border">
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    {ACTION_COLUMNS.map((column) => (
                      <TableHead key={column.key} className="text-center">
                        <span className="inline-flex items-center gap-1">
                          {column.label}
                          <InfoTip text={column.tip} />
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionModules.map((module) => (
                    <TableRow key={module.name}>
                      <TableCell className="font-medium">
                        {module.tooltip ? (
                          <span className="inline-flex items-center gap-1">
                            {module.title}
                            <InfoTip text={module.tooltip} />
                          </span>
                        ) : (
                          module.title
                        )}
                      </TableCell>
                      {ACTION_COLUMNS.map((column) => (
                        <TableCell key={column.key} className="text-center">
                          {module.actions.includes(column.key) ? (
                            <Checkbox
                              checked={(form.permissions[module.name] || []).includes(column.key)}
                              onCheckedChange={(checked) =>
                                toggleAction(module.name, column.key, checked === true)
                              }
                              aria-label={`${module.title} — ${column.label}`}
                            />
                          ) : null}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submit()}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {isEditing ? "Save changes" : "Send invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Share account access?</AlertDialogTitle>
            <AlertDialogDescription>
              Please consider carefully who you share your information with,
              and the permission levels you grant. Choose Cancel to review your
              permissions, or Accept to grant access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
