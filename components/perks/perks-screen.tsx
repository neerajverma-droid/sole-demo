"use client";

import * as React from "react";
import { ExternalLink, Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { PageHeader } from "@/components/layout/page-header";
import { useSolePerksQuery } from "@/hooks/use-sole-perks-query";
import { cn } from "@/lib/utils";
import { type SolePerk } from "@/lib/sole-perks";

/**
 * Sole Perks — the partner deals, pulled live from soleapp.com.au. See
 * `lib/sole-perks.ts` for where the data actually comes from.
 */
export function PerksScreen() {
  const perksQuery = useSolePerksQuery();
  const perks = perksQuery.data ?? [];
  const featured = perks.filter((perk) => perk.featured);
  const regular = perks.filter((perk) => !perk.featured);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Megaphone}
        title="Sole Perks"
        description="Exclusive offers from partners we've lined up to help your business succeed."
      />

      {perksQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Shimmer key={index} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : perksQuery.isError ? (
        <Empty>
          <EmptyMedia>
            <Megaphone aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load Sole Perks</EmptyTitle>
          <EmptyDescription>
            {perksQuery.error instanceof Error
              ? perksQuery.error.message
              : "Something went wrong reaching our partners page."}
          </EmptyDescription>
        </Empty>
      ) : perks.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <Megaphone aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No deals right now</EmptyTitle>
          <EmptyDescription>
            Check back later for exclusive partner offers.
          </EmptyDescription>
        </Empty>
      ) : (
        <>
          {featured.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((perk) => (
                <PerkCard key={perk.id} perk={perk} featured />
              ))}
            </div>
          )}

          {regular.length > 0 && (
            <div className="space-y-3">
              {featured.length > 0 && (
                <h2 className="text-sm font-semibold text-muted-foreground">
                  More deals
                </h2>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {regular.map((perk) => (
                  <PerkCard key={perk.id} perk={perk} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PerkCard({
  perk,
  featured = false,
}: {
  perk: SolePerk;
  featured?: boolean;
}) {
  const [brokenLogo, setBrokenLogo] = React.useState(false);

  return (
    <Card
      className={cn(
        "flex h-full flex-col overflow-hidden p-5",
        featured && "border-primary/30 bg-primary/[0.03]",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background">
          {perk.logoUrl && !brokenLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={perk.logoUrl}
              alt={`${perk.name} logo`}
              className="size-full object-contain p-1.5"
              // A partner-uploaded asset 404ing years later is routine for a
              // directory this size — this is what keeps that a faint initial
              // instead of the browser's own broken-image glyph.
              onError={() => setBrokenLogo(true)}
            />
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">
              {perk.name.charAt(0)}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{perk.name}</h3>
          {featured && (
            <span className="text-xs font-medium text-primary">Featured</span>
          )}
        </div>
      </div>

      {perk.description && (
        <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted-foreground">
          {perk.description}
        </p>
      )}

      {perk.discountDescription && (
        <p className="mt-3 inline-flex w-fit rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success">
          {perk.discountDescription}
        </p>
      )}

      {perk.discountCode && (
        <p className="mt-2 text-xs text-muted-foreground">
          Code:{" "}
          <span className="font-mono font-medium text-foreground">
            {perk.discountCode}
          </span>
        </p>
      )}

      {/*
        No disabled state: `fetchSolePerks` already drops any partner with
        nowhere to send someone, so every card that renders has a real `url`
        — and `disabled` on an anchor rendered through `asChild` wouldn't stop
        it being followed anyway, since anchors have no native disabled state.
      */}
      <Button
        asChild
        variant={featured ? "default" : "outline"}
        size="sm"
        className="mt-4 w-full"
      >
        <a href={perk.url} target="_blank" rel="noopener noreferrer">
          Get this deal
          <ExternalLink aria-hidden />
        </a>
      </Button>
    </Card>
  );
}
