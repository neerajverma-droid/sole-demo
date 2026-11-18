"use client";

import * as React from "react";
import Link from "next/link";
import { useSetAtom } from "jotai";
import { Lock, ShieldOff, Sparkles } from "lucide-react";

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
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { useAccess } from "@/hooks/use-access";
import { moreAddonsOpenAtom, moreAddonsTabAtom } from "@/lib/atoms";

/* ------------------------------------------------------------------ *
 * Who may do what in the asset register
 *
 * Ported from the old app (origin/main pages/assets.js, AssetList.js,
 * AddAssets.js), on top of `useAccess` — the server-computed profile:
 *
 * - Plan: the "assets-advanced" feature (Advanced Assets / Compliance add-on,
 *   or a plan that includes it — Advanced / Pro; there is no free trial) unlocks depreciation, detailed
 *   identification, more photo slots, insurance, lost/stolen, disposal, the
 *   asset registry and the depreciation report. Without it the register is the
 *   basic one: an asset, its photo, and matching.
 * - Permissions: an accountant logged in as a client is limited to the
 *   `asset` actions their grant names (view / add / edit / delete).
 * - Free tier: the server's `can.add_asset` decides whether another asset may
 *   be added this month; the usage counter shows only when the server asks.
 *
 * The server checks the accountant grant on every route; it does NOT check the
 * plan feature or the free-tier allowance on the asset APIs (neither did it for
 * the old app), so these are UI gates.
 * ------------------------------------------------------------------ */

export const ASSETS_ADVANCED_FEATURE = "assets-advanced";
const ASSET_MODULE = "asset";

export type AssetAccess = {
  /** The profile has loaded; until then everything is allowed (no flicker). */
  ready: boolean;
  advanced: boolean;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** The free-tier allowance still lets another asset be added. */
  withinFreeTier: boolean;
  limit: ReturnType<typeof useAccess>["assetLimit"];
};

export function useAssetAccess(): AssetAccess {
  const access = useAccess();
  return {
    ready: access.ready,
    advanced: access.hasFeature(ASSETS_ADVANCED_FEATURE),
    canView: access.can(ASSET_MODULE, "view"),
    canAdd: access.can(ASSET_MODULE, "add"),
    canEdit: access.can(ASSET_MODULE, "edit"),
    canDelete: access.can(ASSET_MODULE, "delete"),
    withinFreeTier: access.assetLimit?.canAdd !== false,
    limit: access.assetLimit,
  };
}

/** Opens the sidebar's add-ons marketplace, where Advanced Assets is sold. */
export function useOpenAddons() {
  const setOpen = useSetAtom(moreAddonsOpenAtom);
  const setTab = useSetAtom(moreAddonsTabAtom);
  return React.useCallback(() => {
    setTab("addons");
    setOpen(true);
  }, [setOpen, setTab]);
}

const ADVANCED_PITCH =
  "Upgrade to the Advanced Assets (Compliance) add-on to unlock depreciation, detailed identification, asset insurance, lost & stolen reporting, disposals and the depreciation report.";

/** The inline "locked" note the old form showed to basic-plan users. */
export function AdvancedAssetsUpsell({ className }: { className?: string }) {
  const openAddons = useOpenAddons();
  return (
    <div
      className={`flex flex-wrap items-start gap-3 rounded-[14px] border border-warning/30 bg-warning/5 p-4 ${className ?? ""}`}
      data-usertour="asset-advanced-upsell"
    >
      <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold">Advanced Assets locked</p>
        <p className="text-sm text-muted-foreground">{ADVANCED_PITCH}</p>
      </div>
      <Button size="sm" variant="outline" onClick={openAddons}>
        <Sparkles />
        See add-ons
      </Button>
    </div>
  );
}

/** A whole screen that needs Advanced Assets, opened on a plan without it. */
export function AdvancedAssetsLocked({ feature }: { feature: string }) {
  const openAddons = useOpenAddons();
  return (
    <div className="mx-auto max-w-3xl">
      <Empty>
        <EmptyMedia>
          <Lock aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>{feature} is part of Advanced Assets</EmptyTitle>
          <EmptyDescription>{ADVANCED_PITCH}</EmptyDescription>
        </div>
        <EmptyActions>
          <Button size="sm" onClick={openAddons}>
            <Sparkles />
            See add-ons
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/assets">Back to assets</Link>
          </Button>
        </EmptyActions>
      </Empty>
    </div>
  );
}

/** An accountant whose grant doesn't cover this. */
export function AssetAccessDenied({ action }: { action: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <Empty>
        <EmptyMedia>
          <ShieldOff aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>You don&apos;t have access to {action}</EmptyTitle>
          <EmptyDescription>
            Your access to this account doesn&apos;t include it. Ask the account owner to update your permissions.
          </EmptyDescription>
        </div>
        <EmptyActions>
          <Button size="sm" variant="outline" asChild>
            <Link href="/assets">Back to assets</Link>
          </Button>
        </EmptyActions>
      </Empty>
    </div>
  );
}

/** The old FreeTierAlertDialog, for when the server says no more assets this month. */
export function FreeTierLimitDialog({
  open,
  onOpenChange,
  resetsOn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resetsOn: string | null;
}) {
  const openAddons = useOpenAddons();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You have reached your monthly limit</AlertDialogTitle>
          <AlertDialogDescription>
            As a free user, you have reached your monthly limit for assets. Upgrade your plan to add as many as you
            need.
            {resetsOn ? ` Your limits reset on ${resetsOn}.` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false);
              openAddons();
            }}
          >
            Upgrade plan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** "Created assets 2 of 3" — only when the server turns the counter on. */
export function AssetUsageCounter() {
  const { limit } = useAssetAccess();
  if (!limit?.displayLimit || !limit.max) return null;
  const used = limit.used ?? 0;
  const percent = Math.min(100, Math.round((used / limit.max) * 100));
  return (
    <div className="space-y-1.5 rounded-[14px] border border-border bg-card p-4" data-usertour="asset-usage-counter">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Created assets</span>
        <span className="tabular text-muted-foreground">
          {used} of {limit.max}
        </span>
      </div>
      <Progress value={percent} aria-label={`${used} of ${limit.max} assets created`} />
      {limit.resetsOn ? <p className="text-xs text-muted-foreground">Resets on {limit.resetsOn}</p> : null}
    </div>
  );
}

/**
 * Runs `proceed` only when a new asset may be added: blocked for an
 * accountant without `asset:add`, and the free-tier dialog when the server
 * says the allowance is used up. Returns the handler and the dialog to mount.
 */
export function useGuardedAddAsset() {
  const access = useAssetAccess();
  const [limitOpen, setLimitOpen] = React.useState(false);
  const guard = React.useCallback(
    (proceed: () => void) => {
      if (!access.canAdd) return;
      if (!access.withinFreeTier) {
        setLimitOpen(true);
        return;
      }
      proceed();
    },
    [access.canAdd, access.withinFreeTier],
  );
  const dialog = (
    <FreeTierLimitDialog open={limitOpen} onOpenChange={setLimitOpen} resetsOn={access.limit?.resetsOn ?? null} />
  );
  return { guard, dialog, canAdd: access.canAdd };
}

/**
 * Wraps an Advanced Assets screen (depreciation, schedule, report, insurance,
 * lost/stolen, disposal) for a direct visit or a bookmarked link: a plan without
 * the feature gets the locked screen, an accountant without the grant gets the
 * no-access screen. `needs` is the action the screen performs ("edit" for one
 * that saves, "view" for a read-only one).
 */
export function AdvancedAssetsGate({
  feature,
  needs,
  children,
}: {
  feature: string;
  needs: "view" | "edit";
  children: React.ReactNode;
}) {
  const access = useAssetAccess();
  if (!access.canView || (needs === "edit" && !access.canEdit)) {
    return <AssetAccessDenied action={feature.toLowerCase()} />;
  }
  if (!access.advanced) return <AdvancedAssetsLocked feature={feature} />;
  return <>{children}</>;
}

/**
 * Wraps the create and edit flows: adding needs the `asset:add` grant and room
 * in the free-tier allowance (old pages/assets/create: blockAction + canData),
 * editing needs `asset:edit`.
 */
export function AssetPermissionGate({
  needs,
  children,
}: {
  needs: "add" | "edit";
  children: React.ReactNode;
}) {
  const access = useAssetAccess();
  const openAddons = useOpenAddons();
  if (!access.canView || (needs === "add" ? !access.canAdd : !access.canEdit)) {
    return <AssetAccessDenied action={needs === "add" ? "adding assets" : "editing assets"} />;
  }
  if (needs === "add" && !access.withinFreeTier) {
    return (
      <div className="mx-auto max-w-3xl">
        <Empty>
          <EmptyMedia>
            <Lock aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>You have reached your monthly limit</EmptyTitle>
            <EmptyDescription>
              As a free user, you have reached your monthly limit for assets.
              {access.limit?.resetsOn ? ` Your limits reset on ${access.limit.resetsOn}.` : ""}
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button size="sm" onClick={openAddons}>
              <Sparkles />
              Upgrade plan
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/assets">Back to assets</Link>
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }
  return <>{children}</>;
}
