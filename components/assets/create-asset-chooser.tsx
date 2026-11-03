"use client";

import Link from "next/link";
import { ArrowLeft, FilePlus2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HeroHairline } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

/**
 * The same flat two-card chooser as Create expense and Create invoice — an
 * inline page, never a modal, and plain white cards rather than the reference's
 * gradients.
 */
export function CreateAssetChooser() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <HeroHairline />
        <div className="space-y-3 p-5">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/assets">
              <ArrowLeft />
              Assets
            </Link>
          </Button>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Create new asset
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose how you&apos;d like to add this asset.
            </p>
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        data-usertour="asset-create-methods"
      >
        <MethodCard
          href="/assets/new/manual"
          title="Create new asset"
          body="Enter the details yourself — what it is, what it cost, who you bought it from, and how it depreciates."
          icon={<FilePlus2 className="size-5 text-primary" />}
        />
        <MethodCard
          href="/assets/new/upload"
          title="Upload asset from docs"
          body="Already have the invoice or receipt? Upload it and Sole reads the details off it. PDF, PNG, JPG or JPEG."
          icon={<Upload className="size-5 text-primary" />}
        />
      </div>
    </div>
  );
}

function MethodCard({
  href,
  title,
  body,
  icon,
}: {
  href: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  const className = cn(
    "flex h-full cursor-pointer items-start gap-4 rounded-lg border border-border bg-card p-5 text-left",
    "shadow-sm outline-none transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md",
    "focus-visible:ring-2 focus-visible:ring-ring",
  );

  const body_ = (
    <>
      <span
        className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm leading-relaxed text-muted-foreground">
          {body}
        </span>
      </span>
    </>
  );

  return (
    <Link href={href} className={className}>
      {body_}
    </Link>
  );
}
