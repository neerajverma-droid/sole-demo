"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldOff, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useSession } from "@/components/auth/session-provider";
import { useAdminAccess, useRecheckAccessOnForbidden } from "@/hooks/use-admin-access";
import {
  ADMIN_BASE,
  ADMIN_LOGIN,
  canAccessAdminPanel,
  resolveAdminRoute,
} from "@/lib/admin/access";

/**
 * Nothing in the admin area renders until three things are known, in order:
 * there's a session, it belongs to an admin, and this admin can open this page.
 *
 * The first mirrors `AuthGuard`, but a dead session goes to the admin sign-in
 * rather than the business one — an admin sent to `/login` would sign in and
 * land in the product. The other two are decided by `resolveAdminRoute`, so
 * the rules live in one tested function rather than in this component's
 * branches.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status !== "unauthenticated") return;
    const params = new URLSearchParams();
    if (pathname && pathname !== ADMIN_BASE) params.set("next", pathname);
    const query = params.toString();
    router.replace(query ? `${ADMIN_LOGIN}?${query}` : ADMIN_LOGIN);
  }, [status, pathname, router]);

  if (status !== "authenticated") {
    return (
      <GateLoading
        label={status === "loading" ? "Loading your account…" : "Signing you out…"}
      />
    );
  }

  return <AdminGate>{children}</AdminGate>;
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useSession();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { access, isLoading, isError, refetch } = useAdminAccess();
  useRecheckAccessOnForbidden();

  const panelAllowed = canAccessAdminPanel(user);
  const decision = React.useMemo(
    () => resolveAdminRoute(pathname, access),
    [pathname, access],
  );

  const redirectTo =
    panelAllowed && !isLoading && !isError && decision.kind === "redirect"
      ? decision.href
      : null;

  React.useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (!panelAllowed) {
    return (
      <GateState
        icon={<ShieldOff />}
        title="This account doesn't have admin access"
        description="Sign in with an admin account to open the admin area, or go back to Sole."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Back to Sole</Link>
            </Button>
            <Button onClick={() => signOut()}>Sign in as someone else</Button>
          </>
        }
      />
    );
  }

  if (isLoading || redirectTo) {
    return <GateLoading label="Checking your admin access…" />;
  }

  if (isError) {
    return (
      <GateState
        icon={<TriangleAlert />}
        title="Couldn't check your admin access"
        description="The access check didn't respond. Try again, and if it keeps failing, check the API is reachable."
        actions={<Button onClick={() => refetch()}>Try again</Button>}
      />
    );
  }

  if (decision.kind === "none") {
    return (
      <GateState
        icon={<KeyRound />}
        title="No admin sections granted yet"
        description="Your admin account doesn't have access to any section. Ask a super admin to grant you one."
        actions={
          <Button variant="outline" onClick={() => signOut()}>
            Log out
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
}

function GateLoading({ label }: { label: string }) {
  return (
    <div
      className="grid min-h-svh w-full place-items-center"
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {label}
      </span>
    </div>
  );
}

function GateState({
  icon,
  title,
  description,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh w-full place-items-center bg-muted/30 p-4">
      <Empty className="w-full max-w-md">
        <EmptyMedia>{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
        <EmptyActions>{actions}</EmptyActions>
      </Empty>
    </div>
  );
}
