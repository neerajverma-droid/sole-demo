"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronsUpDown,
  Lock,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BUSINESS_LOCK_CTA,
  BUSINESS_LOCK_REASON,
  businessCountLabel,
  businessInitials,
  businessLocked,
  businessPaymentHref,
  businessTone,
  type BusinessProfile,
} from "@/lib/businesses";
import {
  MANAGE_BUSINESSES_HREF,
  NEW_BUSINESS_HREF,
} from "@/lib/businesses-route";
import { cn } from "@/lib/utils";
import { activeBusiness, useBusinessesStore } from "@/stores/businesses";
import { useBusinessesQuery } from "@/hooks/use-businesses-query";
import { Shimmer } from "@/components/ui/shimmer";
import { useWelcomeStore } from "@/stores/welcome";

/**
 * A business's avatar: a coloured square with its initials.
 *
 * A square rather than the round avatar people get — a business isn't a person,
 * and the two appear within a few hundred pixels of each other in this rail.
 */
export function BusinessAvatar({
  business,
  className,
}: {
  business: BusinessProfile;
  className?: string;
}) {
  if (business.logo) {
    return (
      <img
        src={business.logo}
        alt=""
        aria-hidden
        className={cn("size-8 shrink-0 rounded-md object-cover", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold",
        businessTone(business),
        className,
      )}
      aria-hidden
    >
      {businessInitials(business)}
    </span>
  );
}

/**
 * The contents of the Switch business menu.
 *
 * The items rather than a whole menu, so the switcher can host them in the shape
 * it needs. No longer exported: the profile menu used to carry a second copy of
 * this list, and the switcher at the top of the rail is the only way in now —
 * one entry point being easier to keep honest than two that have to agree.
 */
function BusinessSwitcherItems() {
  const router = useRouter();
  const businesses = useBusinessesStore((state) => state.businesses);
  const activeId = useBusinessesStore((state) => state.activeId);
  const select = useBusinessesStore((state) => state.select);
  const reopenFirstRun = useWelcomeStore((state) => state.reopen);

  return (
    <>
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
        Switch business
      </DropdownMenuLabel>

      {businesses.map((business) => {
        const locked = businessLocked(business);
        const current = business.id === activeId;

        /*
         * A locked row stays live rather than being disabled.
         *
         * The platform's usual rule is to disable an action that doesn't apply
         * and put the reason on hover, and that's right when there's nothing to
         * be done about it. This isn't that: the business exists and its setup
         * is half finished, so the row has somewhere useful to go — and a
         * disabled row can't take a click, or host the link in its tooltip.
         */
        const row = (
          <DropdownMenuItem
            onSelect={() => {
              if (locked) {
                router.push(businessPaymentHref(business));
                return;
              }
              select(business.id);
              toast.success(`Switched to ${business.name}`);
            }}
            className="gap-2.5"
          >
            <BusinessAvatar
              business={business}
              className={cn("size-7", locked && "opacity-60")}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                locked && "text-muted-foreground",
              )}
            >
              {business.name}
            </span>
            {locked ? (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 rounded-full border-transparent bg-muted px-2 py-0 text-[11px] font-medium text-muted-foreground"
              >
                <Lock className="size-2.5" aria-hidden />
                Locked
              </Badge>
            ) : (
              current && (
                <span className="shrink-0 text-primary">
                  <Check className="size-4" aria-hidden />
                  <span className="sr-only">Currently open</span>
                </span>
              )
            )}
          </DropdownMenuItem>
        );

        if (!locked) return <div key={business.id}>{row}</div>;

        return (
          <Tooltip key={business.id}>
            <TooltipTrigger asChild>
              <div>{row}</div>
            </TooltipTrigger>
            {/*
              Radix leaves tooltip content hoverable by default, which is what
              lets the CTA below be a real link rather than a label describing
              one. The row does the same thing on click, so the tooltip is the
              explanation and not the only way through.
            */}
            <TooltipContent side="right" className="max-w-60 space-y-1.5 p-2.5">
              <p className="leading-relaxed">{BUSINESS_LOCK_REASON}</p>
              <Link
                href={businessPaymentHref(business)}
                className="flex items-center gap-1 rounded font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {BUSINESS_LOCK_CTA}
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </TooltipContent>
          </Tooltip>
        );
      })}

      <DropdownMenuSeparator />

      {/*
        A page now, not a dialog. `asChild` on the item so it's a real link —
        it navigates on middle-click and on Enter like any other, which a
        handler calling `router.push` wouldn't.
      */}
      <DropdownMenuItem asChild>
        <Link href={NEW_BUSINESS_HREF}>
          <Plus className="text-muted-foreground" />
          Add business
        </Link>
      </DropdownMenuItem>
      {/* Below Add business: creating one is the common errand, and managing
          the set is where you go when it isn't. */}
      <DropdownMenuItem asChild>
        <Link href={MANAGE_BUSINESSES_HREF}>
          <Settings className="text-muted-foreground" />
          Manage businesses
        </Link>
      </DropdownMenuItem>
    </>
  );
}

/**
 * The switcher at the top of the rail.
 *
 * Directly under the logo, because which business you're in frames everything
 * below it — a figure read in the wrong business is worse than not finding it.
 * The row says which one is open and how many there are, so the count answers
 * "is there anywhere else to be" without opening anything.
 */
export function BusinessSwitcher() {
  // Mounted here rather than deeper down: this is the one place guaranteed to
  // render on every app page, so it's where the shared list gets loaded.
  useBusinessesQuery();

  const businesses = useBusinessesStore((state) => state.businesses);
  const activeId = useBusinessesStore((state) => state.activeId);
  const current = activeBusiness({ businesses, activeId });

  if (!current) {
    return (
      <div
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2"
        aria-hidden
      >
        <Shimmer className="size-8 shrink-0 bg-accent" />
        <Shimmer className="h-4 flex-1 bg-accent" />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Current business: ${current.name}. Switch business.`}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none",
            "transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <BusinessAvatar business={current} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {current.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {businessCountLabel(businesses.length)}
            </span>
          </span>
          <ChevronsUpDown
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
      >
        <BusinessSwitcherItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
