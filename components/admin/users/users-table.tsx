"use client";

import Link from "next/link";
import { Building2, Copy, LogIn, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuAction } from "@/components/ui/menu-action";
import { Shimmer } from "@/components/ui/shimmer";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Highlight } from "@/components/contacts/highlight";
import { StatusPill } from "@/components/admin/shared/status-pill";
import { formatAdminDate } from "@/lib/admin/format";
import {
  impersonateBlockedReason,
  platformLabel,
  signupSourceLabel,
  userDisplayName,
  userInitials,
  verificationPill,
  type PlatformUser,
} from "@/lib/admin/users";
import { cn } from "@/lib/utils";

/**
 * One row per account owner, newest sign-up first.
 *
 * A deleted account stays in the list when the filter asks for it, dimmed and
 * labelled — an account you can't see is one you can't check — but its
 * actions say why they don't apply rather than disappearing.
 */
export function UsersTable({
  users,
  loading,
  search,
  canOpenTenants,
  onImpersonate,
  onDelete,
}: {
  users: PlatformUser[];
  loading: boolean;
  search: string;
  /** The `tenants` grant: without it the tenant column is plain text. */
  canOpenTenants: boolean;
  onImpersonate: (user: PlatformUser) => void;
  onDelete: (user: PlatformUser) => void;
}) {
  return (
    <Table>
      <TableHeader className="surface-subtle">
        <TableRow>
          <TableHead className="pl-4">User</TableHead>
          <TableHead>Business</TableHead>
          <TableHead className={HUG_COLUMN}>Tenant</TableHead>
          <TableHead className={HUG_COLUMN}>Platform</TableHead>
          <TableHead className={HUG_COLUMN}>Signed up with</TableHead>
          <TableHead className={HUG_COLUMN}>Status</TableHead>
          <TableHead className={HUG_COLUMN}>Joined</TableHead>
          <TableHead className={`${HUG_COLUMN} pr-4`}>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading
          ? Array.from({ length: 10 }, (_, index) => <SkeletonRow key={index} />)
          : users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                search={search}
                canOpenTenants={canOpenTenants}
                onImpersonate={onImpersonate}
                onDelete={onDelete}
              />
            ))}
      </TableBody>
    </Table>
  );
}

function UserRow({
  user,
  search,
  canOpenTenants,
  onImpersonate,
  onDelete,
}: {
  user: PlatformUser;
  search: string;
  canOpenTenants: boolean;
  onImpersonate: (user: PlatformUser) => void;
  onDelete: (user: PlatformUser) => void;
}) {
  const name = userDisplayName(user);
  const deleted = user.deletedAt !== null;
  const verification = verificationPill(user.verified);
  const blocked = impersonateBlockedReason(user, canOpenTenants);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(user.email);
      toast.success("Email copied");
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  return (
    <TableRow className={cn(deleted && "bg-muted/30")}>
      <TableCell className="pl-4">
        <div className={cn("flex min-w-0 items-center gap-3", deleted && "opacity-60")}>
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            aria-hidden
          >
            {userInitials(user)}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-medium">
              <span className="truncate">
                <Highlight text={name} query={search} />
              </span>
            </p>
            {name !== user.email && (
              <p className="truncate text-xs text-muted-foreground">
                <Highlight text={user.email} query={search} />
              </p>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
        {user.company ? <Highlight text={user.company} query={search} /> : "–"}
      </TableCell>

      <TableCell className={`${HUG_COLUMN} text-sm`}>
        {!user.tenantId ? (
          <span className="text-muted-foreground">None</span>
        ) : canOpenTenants ? (
          <Link
            href={`/admin/tenants/${user.tenantId}`}
            className="rounded-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            #{user.tenantId}
          </Link>
        ) : (
          <span className="tabular">#{user.tenantId}</span>
        )}
      </TableCell>

      <TableCell className={HUG_COLUMN}>
        <StatusPill label={platformLabel(user.platform)} tone="neutral" />
      </TableCell>

      <TableCell className={`${HUG_COLUMN} text-sm text-muted-foreground`}>
        {signupSourceLabel(user.signupSource)}
      </TableCell>

      <TableCell className={HUG_COLUMN}>
        {deleted ? (
          <StatusPill label="Deleted" tone="danger" />
        ) : (
          <StatusPill label={verification.label} tone={verification.tone} />
        )}
      </TableCell>

      <TableCell className={`${HUG_COLUMN} text-sm text-muted-foreground tabular`}>
        {formatAdminDate(user.signupDate)}
      </TableCell>

      <TableCell className={`${HUG_COLUMN} pr-4`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <MenuAction
              icon={<LogIn />}
              label="Sign in as user"
              onSelect={() => onImpersonate(user)}
              disabledReason={blocked ?? undefined}
            />
            <MenuAction icon={<Copy />} label="Copy email" onSelect={copyEmail} />
            <MenuAction
              icon={<Building2 />}
              label="Open tenant"
              href={user.tenantId ? `/admin/tenants/${user.tenantId}` : undefined}
              disabledReason={
                !user.tenantId
                  ? "This account isn't in a tenant."
                  : !canOpenTenants
                    ? "You don't have access to Tenants."
                    : undefined
              }
            />
            <DropdownMenuSeparator />
            <MenuAction
              icon={<Trash2 />}
              label="Delete account"
              destructive
              onSelect={() => onDelete(user)}
              disabledReason={deleted ? "This account is already deleted." : undefined}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRow() {
  return (
    <TableRow aria-hidden>
      <TableCell className="pl-4">
        <div className="flex items-center gap-3">
          <Shimmer className="size-8 rounded-full" />
          <div className="space-y-1.5">
            <Shimmer className="h-4 w-36 rounded-md" />
            <Shimmer className="h-3 w-48 rounded-md" />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Shimmer className="h-4 w-28 rounded-md" />
      </TableCell>
      {Array.from({ length: 5 }, (_, index) => (
        <TableCell key={index}>
          <Shimmer className="h-5 w-16 rounded-full" />
        </TableCell>
      ))}
      <TableCell className="pr-4">
        <Shimmer className="size-8 rounded-md" />
      </TableCell>
    </TableRow>
  );
}
