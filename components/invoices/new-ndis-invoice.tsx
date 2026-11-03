"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { HeartHandshake } from "lucide-react";

import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import {
  isNdisBusinessProfile,
  useActiveBusiness,
} from "@/hooks/use-active-business";

/**
 * The NDIS invoice route.
 *
 * It's gated on the same signal the chooser's NDIS card is gated on — the
 * business's real `industry_id` from its profile — and nothing else. Those two
 * gates disagreeing is what previously made the card navigate here and bounce
 * straight back: the card read the server's record while this read a local
 * settings store that defaulted to a non-NDIS industry.
 *
 * The provider's own NDIS number is deliberately *not* required here. It's
 * shown on the claim header when it's set, and a provider part-way through
 * setting up should still be able to draft a claim.
 *
 * A business that isn't in the NDIS industry is told so rather than being
 * redirected. A silent bounce back to the chooser is indistinguishable from
 * a broken button, which is exactly how this route used to fail.
 */
export function NewNdisInvoice({ templateId }: { templateId?: string }) {
  const { business, loading, error } = useActiveBusiness();

  if (isNdisBusinessProfile(business)) {
    return <InvoiceEditor variant="ndis" templateId={templateId} />;
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
        <EmptyTitle>
          {error
            ? "Couldn't check your business profile"
            : "NDIS invoicing isn't available for this business"}
        </EmptyTitle>
        <EmptyDescription>
          {error
            ? "Try again in a moment, or start a general invoice instead."
            : "NDIS claims are for businesses in Health and Social Care. Set your industry in Business details, or raise a general invoice."}
        </EmptyDescription>
      </div>
      <EmptyActions>
        <Button asChild>
          <Link href="/invoices/new/general">Create a general invoice</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/settings?section=business">Business details</Link>
        </Button>
      </EmptyActions>
    </Empty>
  );
}
