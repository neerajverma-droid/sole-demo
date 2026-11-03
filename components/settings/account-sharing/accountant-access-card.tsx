"use client";

import * as React from "react";
import { Loader2, Pencil, Shield, Trash2, UserPlus } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RowIconButton } from "@/components/ui/row-icon-button";
import {
  SkeletonActionCell,
  SkeletonBadgeCell,
  SkeletonRows,
  SkeletonTextCell,
} from "@/components/ui/table-skeleton";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SectionCard } from "@/components/settings/section-card";
import { AccountantInviteDialog } from "@/components/settings/account-sharing/accountant-invite-dialog";
import {
  useAccountantAccessQuery,
  useAddSupportAccess,
  useDeleteAccountantInvite,
} from "@/hooks/use-accountant-access-query";
import { accountantStatusVariant, type AccountantInvite } from "@/lib/accountant-access";

const SOLE_SUPPORT_EMAIL = "support@soleapp.com.au";

/**
 * Who else can see this account's books — a named invite with a permission
 * matrix and an expiry, as opposed to the shared-secret SPM connection below
 * it. Also where Sole Support's own 30-day access grant lives.
 */
export function AccountantAccessCard() {
  const query = useAccountantAccessQuery();
  const addSupportAccess = useAddSupportAccess();
  const deleteInvite = useDeleteAccountantInvite();

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountantInvite | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<AccountantInvite | null>(null);
  const [supportConfirmOpen, setSupportConfirmOpen] = React.useState(false);

  const invites = query.data?.invites ?? [];
  const permissionModules = query.data?.permissionModules ?? [];
  const hasSupportAccess = invites.some(
    (invite) => invite.email === SOLE_SUPPORT_EMAIL && invite.status !== "Rejected",
  );

  const confirmRemove = async () => {
    if (!removeTarget) return;
    await deleteInvite.mutateAsync(removeTarget.id);
    setRemoveTarget(null);
  };

  const confirmSupportAccess = async () => {
    await addSupportAccess.mutateAsync();
    setSupportConfirmOpen(false);
  };

  return (
    <SectionCard
      title="Access Details"
      description="Share access to your account and its data — an accountant or bookkeeper can be limited to the modules and actions they actually need, and access can always be revoked."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus />
            Invite access
          </Button>
          <Button
            size="sm"
            disabled={hasSupportAccess || addSupportAccess.isPending}
            onClick={() => setSupportConfirmOpen(true)}
          >
            <Shield />
            {hasSupportAccess ? "Sole Support connected" : "Sole Support access"}
          </Button>
        </div>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className={HUG_COLUMN}>Status</TableHead>
            <TableHead className={HUG_COLUMN}>Start date</TableHead>
            <TableHead className={HUG_COLUMN}>End date</TableHead>
            <TableHead className={HUG_COLUMN}>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isPending ? (
            <SkeletonRows
              count={3}
              render={() => (
                <>
                  <SkeletonTextCell width="w-28" />
                  <SkeletonTextCell width="w-40" />
                  <SkeletonBadgeCell />
                  <SkeletonTextCell width="w-20" />
                  <SkeletonTextCell width="w-20" />
                  <SkeletonActionCell />
                </>
              )}
            />
          ) : invites.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                No one else has access to your account yet.
              </TableCell>
            </TableRow>
          ) : (
            invites.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell className="font-medium">{invite.name}</TableCell>
                <TableCell className="text-muted-foreground">{invite.email}</TableCell>
                <TableCell className={HUG_COLUMN}>
                  <Badge variant={accountantStatusVariant(invite.status)}>
                    {invite.status}
                  </Badge>
                </TableCell>
                <TableCell className={HUG_COLUMN}>{invite.startDate || "N/A"}</TableCell>
                <TableCell className={HUG_COLUMN}>{invite.endDate || "N/A"}</TableCell>
                <TableCell className={HUG_COLUMN}>
                  <div className="flex items-center justify-end gap-1">
                    <RowIconButton
                      icon={<Pencil />}
                      label={`Edit ${invite.name}'s access`}
                      onClick={() => setEditing(invite)}
                    />
                    <RowIconButton
                      icon={<Trash2 />}
                      label={`Remove ${invite.name}'s access`}
                      destructive
                      onClick={() => setRemoveTarget(invite)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <AccountantInviteDialog
        open={inviteOpen || editing !== null}
        invite={editing}
        permissionModules={permissionModules}
        onOpenChange={(open) => {
          if (!open) {
            setInviteOpen(false);
            setEditing(null);
          }
        }}
      />

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove shared access?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.name} can&apos;t access your account in future.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteInvite.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteInvite.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmRemove();
              }}
            >
              {deleteInvite.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={supportConfirmOpen} onOpenChange={setSupportConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Granting Sole Support access</AlertDialogTitle>
            <AlertDialogDescription>
              To share access with the Sole Support Team, hit Accept below, and
              an access connection will be shared for 30 days, allowing us to
              better investigate your technical issues. You can revoke or amend
              this access at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={addSupportAccess.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={addSupportAccess.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmSupportAccess();
              }}
            >
              {addSupportAccess.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
