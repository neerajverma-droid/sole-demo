"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CreditCard,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Star,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HeroHairline } from "@/components/layout/page-header";
import { BusinessAvatar } from "@/components/layout/business-switcher";
import { LogoutDialog } from "@/components/layout/logout-dialog";
import {
  MANAGE_BUSINESSES_HREF,
  NEW_BUSINESS_HREF,
} from "@/lib/businesses-route";
import {
  businessPaymentHref,
  businessPlanLabel,
  businessRenewalLabel,
  businessStatus,
  type BusinessProfile,
} from "@/lib/businesses";
import { pricingMoney } from "@/lib/pricing";
import { apiErrorMessage } from "@/lib/api-error";
import { Shimmer } from "@/components/ui/shimmer";
import { cn } from "@/lib/utils";
import { useBusinessesStore } from "@/stores/businesses";
import { useBusinessesQuery } from "@/hooks/use-businesses-query";
import { useSessionStore } from "@/stores/session";

/**
 * Businesses & subscriptions.
 *
 * One page for the set rather than a business-per-screen: what you come here to
 * do is compare — which is active, which is costing what, which one opens by
 * default — and that's a question about all of them at once.
 *
 * The account sits above them because it owns them, and because logging out and
 * editing your own details are errands about you rather than about any one
 * business.
 */
export function BusinessesScreen() {
  const router = useRouter();
  const query = useBusinessesQuery();
  const businesses = useBusinessesStore((state) => state.businesses);
  const defaultId = useBusinessesStore((state) => state.defaultId);
  const hydrated = useBusinessesStore((state) => state.hydrated);
  const select = useBusinessesStore((state) => state.select);
  const setDefault = useBusinessesStore((state) => state.setDefault);
  const removeBusiness = useBusinessesStore((state) => state.removeBusiness);
  const accountEmail = useSessionStore((state) => state.user?.email as string | undefined);

  const [loggingOut, setLoggingOut] = React.useState(false);
  /** The unactivated business queued for removal, if any. */
  const [removing, setRemoving] = React.useState<BusinessProfile | null>(null);
  /** Which business the DELETE call is in flight for, if any. */
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  /** Open a business: switch the context, then go to its dashboard. */
  const open = (business: BusinessProfile) => {
    select(business.id);
    toast.success(`Switched to ${business.name}`);
    router.push("/dashboard");
  };

  const makeDefault = async (business: BusinessProfile) => {
    try {
      await setDefault(business.id);
      toast.success(`${business.name} is now your default business.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't set that as default. Try again."));
    }
  };

  return (
    <div className="space-y-[15px]">
      {/* Header --------------------------------------------------------- */}
      <div className="space-y-2">
        <Badge
          variant="outline"
          className="rounded-full border-transparent bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary"
        >
          Manage
        </Badge>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Businesses &amp; subscriptions
          </h1>
          <p className="text-sm text-muted-foreground">
            One place to manage every business, its subscription and your
            account.
          </p>
        </div>
      </div>

      {/* Account -------------------------------------------------------- */}
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {/* The brand device every hero card on the platform wears, so this one
            is that treatment rather than a gradient invented for it. */}
        <HeroHairline />
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
              aria-hidden
            >
              <User className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">Your account</h2>
              <p className="truncate text-sm text-muted-foreground">
                {accountEmail ?? "…"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/settings">Edit account</Link>
            </Button>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setLoggingOut(true)}
            >
              <LogOut />
              Log out
            </Button>
          </div>
        </div>
      </section>

      {/* Businesses ----------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Your businesses</h2>
        <Button asChild>
          <Link href={NEW_BUSINESS_HREF}>
            <Plus />
            Add business
          </Link>
        </Button>
      </div>

      {!hydrated && query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((key) => (
            <BusinessCardSkeleton key={key} />
          ))}
        </div>
      ) : businesses.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <Building2 aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No businesses yet</EmptyTitle>
            <EmptyDescription>
              Add one to start invoicing, tracking expenses and keeping its
              books separate from anything else you run.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button size="sm" asChild>
              <Link href={NEW_BUSINESS_HREF}>
                <Plus />
                Add business
              </Link>
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        /*
         * Three columns at desktop, and a single business gets one of them
         * rather than the full width — a card stretched across a page reads as a
         * banner, and this is a card in a set that happens to have one member.
         */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((business) => (
            <BusinessCard
              key={business.id}
              business={business}
              isDefault={business.id === defaultId}
              /** Hidden where there's only one — it's already the default. */
              canSetDefault={businesses.length > 1}
              isDeleting={business.id === deletingId}
              onOpen={() => open(business)}
              onSetDefault={() => makeDefault(business)}
              onRemove={() => setRemoving(business)}
            />
          ))}
        </div>
      )}

      <LogoutDialog open={loggingOut} onOpenChange={setLoggingOut} />

      {/* The standard confirmation for anything that can't be undone by
          clicking again. It says what isn't at stake, because "remove" on a
          business is the kind of word that stops people who have nothing to
          lose by it. */}
      <AlertDialog
        open={!!removing}
        onOpenChange={(next) => !next && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This business hasn&apos;t been activated, so no data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!deletingId}
              onClick={async (event) => {
                // Radix closes the dialog on click by default — held open here
                // so the spinner has somewhere to show while the call is out.
                event.preventDefault();
                if (!removing || deletingId) return;
                const target = removing;
                setDeletingId(target.id);
                try {
                  await removeBusiness(target.id);
                  toast.success(`${target.name} removed`);
                  setRemoving(null);
                } catch (error) {
                  toast.error(
                    apiErrorMessage(error, `Couldn't remove ${target.name}. Try again.`),
                  );
                } finally {
                  setDeletingId(null);
                }
              }}
            >
              {deletingId && <Loader2 className="animate-spin" aria-hidden />}
              {deletingId ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The card's own shape, in bars — an avatar square, a title and a status
 * line, two lines of detail, the subscription block, then the action row —
 * so arriving content doesn't jump the layout, and the sweep reads as this
 * specific card loading rather than a generic placeholder.
 */
function BusinessCardSkeleton() {
  return (
    <Shimmer className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="size-9 shrink-0 rounded-md bg-muted" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <span className="block h-3.5 w-3/4 rounded bg-muted" />
            <span className="block h-3 w-1/3 rounded-full bg-muted" />
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="block h-2.5 w-full rounded bg-muted" />
          <span className="block h-2.5 w-2/3 rounded bg-muted" />
        </div>
        <span className="mt-auto block h-12 w-full rounded-md bg-muted" />
      </div>
      <div className="border-t border-border p-3">
        <span className="block h-8 w-20 rounded-md bg-muted" />
      </div>
    </Shimmer>
  );
}

/**
 * One business.
 *
 * The whole card is a target, with the controls sitting above it. That's a
 * button laid under the content rather than a link wrapping it: a link wrapping
 * buttons is invalid markup and ambiguous about what a click means, and the
 * controls take `relative z-10` so they paint over the overlay and take their
 * own clicks first.
 */
function BusinessCard({
  business,
  isDefault,
  canSetDefault,
  isDeleting,
  onOpen,
  onSetDefault,
  onRemove,
}: {
  business: BusinessProfile;
  isDefault: boolean;
  canSetDefault: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const active = business.paid;
  const status = businessStatus(business);
  const renewal = businessRenewalLabel(business);

  /*
   * An unactivated business can't be opened, so its card goes where its button
   * goes — the payment step. Same destination as the switcher's locked row, so
   * the two surfaces agree about what a locked business is for.
   */
  const openCard = () =>
    active ? onOpen() : router.push(businessPaymentHref(business));

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-lg border border-border bg-card shadow-sm transition-colors hover:border-primary/30",
        isDeleting && "pointer-events-none",
      )}
    >
      {/* Sits over the card rather than replacing it — losing the layout
          while the request is out would jump the grid under it. */}
      {isDeleting && (
        <Shimmer className="absolute inset-0 z-20 rounded-lg" aria-hidden />
      )}
      <div
        className={cn(
          "flex flex-1 flex-col gap-3 p-4",
          isDeleting && "opacity-30",
        )}
      >
        {/* Identity ---------------------------------------------------- */}
        <div className="flex items-start gap-3">
          <BusinessAvatar
            business={business}
            className={cn("size-9", !active && "opacity-60")}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h3 className="min-w-0 truncate text-sm font-semibold">
                {business.name}
              </h3>
              <StatusPill status={status} />
            </div>
            {isDefault && (
              <Badge
                variant="outline"
                className="gap-1 rounded-full border-transparent bg-primary/10 px-2 py-0 text-[10px] font-semibold text-primary"
              >
                <Star className="size-2.5 fill-current" aria-hidden />
                Default
              </Badge>
            )}
          </div>

          {/* Above the overlay, so these take their own clicks. */}
          <div className="relative z-10 flex shrink-0 items-center gap-0.5">
            {/*
              Only where it would do something: a business that's already
              the default, one awaiting payment, and the sole business on the
              account all have nothing to set.
            */}
            {active && !isDefault && canSetDefault && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    aria-label={`Set ${business.name} as default`}
                    onClick={onSetDefault}
                  >
                    <Star className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Set as default</TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label={`Edit ${business.name}`}
              asChild
            >
              <Link href={`${MANAGE_BUSINESSES_HREF}/${business.id}`}>
                <Pencil className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p className="truncate">{business.email || "No email yet"}</p>
          <p className="truncate tabular">
            {business.abn ? `ABN ${business.abn}` : "No ABN yet"}
          </p>
        </div>

        {/* Subscription ------------------------------------------------ */}
        <div className="mt-auto flex items-start gap-2.5 rounded-md border border-border surface-subtle p-2.5">
          <CreditCard
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-medium">
                {businessPlanLabel(business)}
              </p>
              {active && business.subscription ? (
                <p className="shrink-0 text-xs font-semibold tabular">
                  {pricingMoney(business.subscription.price)}/mo
                </p>
              ) : (
                <p className="shrink-0 text-xs font-medium text-warning">
                  Not active
                </p>
              )}
            </div>
            {renewal && (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular">
                {renewal}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions ------------------------------------------------------- */}
      <div
        className={cn(
          "relative z-10 flex items-center justify-between gap-2 border-t border-border p-3",
          isDeleting && "opacity-30",
        )}
      >
        {active ? (
          <Button variant="outline" size="sm" onClick={onOpen}>
            Open
          </Button>
        ) : (
          <Button size="sm" asChild>
            <Link href={businessPaymentHref(business)}>Pay &amp; activate</Link>
          </Button>
        )}

        {/*
          Only where there's nothing to lose. Closing a live business means
          dealing with its records and its subscription, which is a flow of its
          own — offering a trash icon for it here would promise something this
          page can't safely do.
        */}
        {!active && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${business.name}`}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Last in the DOM so it sits under the content but over the padding —
          the controls above carry z-10 and take precedence. */}
      <button
        type="button"
        onClick={openCard}
        aria-label={
          active
            ? `Open ${business.name}`
            : `Complete payment for ${business.name}`
        }
        className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

/**
 * Active or awaiting payment.
 *
 * Green for live and amber for outstanding, with a padlock on the amber one —
 * amber rather than red because payment not yet taken is work pending, not an
 * error, and the same reasoning the switcher's locked row follows.
 */
function StatusPill({ status }: { status: "Active" | "Payment required" }) {
  if (status === "Active") {
    return (
      <Badge
        variant="success"
        className="shrink-0 rounded-full px-2 py-0 text-[10px] font-semibold"
      >
        Active
      </Badge>
    );
  }

  return (
    <Badge
      variant="warning"
      className="shrink-0 gap-1 rounded-full px-2 py-0 text-[10px] font-semibold"
    >
      <Lock className="size-2.5" aria-hidden />
      Payment required
    </Badge>
  );
}
