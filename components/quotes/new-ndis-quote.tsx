"use client";

import Link from "next/link";
import { HeartHandshake } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { QuoteEditor } from "@/components/quotes/quote-editor";
import {
  isNdisBusinessProfile,
  useActiveBusiness,
} from "@/hooks/use-active-business";

/**
 * The NDIS quote route.
 *
 * Gated on exactly the same signal as the NDIS invoice route — the business's
 * real `industry_id` from its profile — so the chooser's card and this page
 * can't disagree about whether the path exists.
 *
 * A business that isn't in the NDIS industry is told so rather than being
 * redirected: a silent bounce back to the chooser is indistinguishable from a
 * broken button.
 */
export function NewNdisQuote({
  templateId,
  duplicateId,
}: {
  templateId?: string;
  duplicateId?: string;
}) {
  const { business, loading } = useActiveBusiness();

  if (isNdisBusinessProfile(business)) {
    return (
      <QuoteEditor
        variant="ndis"
        templateId={templateId}
        duplicateId={duplicateId}
      />
    );
  }

  // Still waiting on the profile: nothing can be said about it yet.
  if (loading) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Checking your profile…
      </p>
    );
  }

  return (
    <Empty>
      <EmptyMedia>
        <HeartHandshake aria-hidden />
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>NDIS quoting isn&apos;t available here</EmptyTitle>
        <EmptyDescription>
          NDIS quotes are for businesses registered under Health and Social
          Care. Set your industry in Business details, or raise a general quote
          instead.
        </EmptyDescription>
      </div>
      <EmptyActions>
        <Button asChild>
          <Link href="/quotes/new/manual">Create a general quote</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/settings?section=business">Business details</Link>
        </Button>
      </EmptyActions>
    </Empty>
  );
}
