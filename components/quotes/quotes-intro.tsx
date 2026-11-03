"use client";

import Link from "next/link";
import {
  CircleX,
  FileCheck2,
  FileText,
  Receipt,
  Repeat2,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  FloatingPreview,
  OnboardingHero,
} from "@/components/layout/onboarding-hero";
import { useCountryContext } from "@/hooks/use-country-context";
import { taxWord } from "@/lib/country-context";

/** The no-quotes-yet onboarding state, per the prototype's intro view. */
export function QuotesIntro() {
  const { country } = useCountryContext();
  const tax = taxWord(country);
  return (
    <OnboardingHero
      eyebrow="Quotes"
      title="Create your first quote"
      body="Win work faster with professional proposals your clients can approve in a click — then turn an accepted quote into an invoice instantly."
      benefits={[
        {
          icon: Send,
          title: "Faster approvals",
          body: "Clients accept or decline online — you're notified the moment they do.",
        },
        {
          icon: Sparkles,
          title: "Professional proposals",
          body: `${tax}-ready line items, discounts and your branding, built in.`,
        },
        {
          icon: Repeat2,
          title: "One-click invoice conversion",
          body: "When a quote is accepted, generate the matching invoice instantly.",
        },
      ]}
      actions={
        <Button asChild>
          <Link href="/quotes/new">
            <FileCheck2 />
            Create new quote
          </Link>
        </Button>
      }
      caption="Takes about 2 minutes · no card required"
      secondary={{
        label: "or take a look first:",
        children: (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast("Sample quote isn't built yet", {
                  description: "It opens a read-only example quote.",
                })
              }
            >
              View sample
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast("The demo video isn't wired up yet", {
                  description: "A 90-second walkthrough of the quote flow.",
                })
              }
            >
              Watch a quick demo
            </Button>
          </>
        ),
      }}
      preview={<AcceptedQuotePreview />}
      lifecycle={{
        title: "The life cycle of a quote",
        trunk: [
          { label: "Quote", icon: FileText },
          { label: "Sent to client", icon: Send },
        ],
        branches: [
          {
            label: "Accepted → invoice",
            icon: Receipt,
            tone: "success",
            glow: true,
          },
          { label: "Declined", icon: CircleX, tone: "danger" },
        ],
        body: "When your client accepts, Sole turns the quote into an invoice automatically — no re-typing. If they decline, you'll know right away.",
      }}
    />
  );
}

/** A still of an accepted quote. */
function AcceptedQuotePreview() {
  const { country } = useCountryContext();
  return (
    <FloatingPreview stamp={{ label: "Accepted", tone: "success" }}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Quote
          </span>
          <span className="text-xs text-muted-foreground tabular">
            29 Jul 2026
          </span>
        </div>

        <p className="text-lg font-semibold tracking-tight tabular">
          QUO-45410
        </p>

        <div className="space-y-2" aria-hidden>
          <div className="h-2 w-1/3 rounded-sm bg-primary" />
          <div className="h-1.5 w-full rounded-full bg-muted-foreground/20" />
          <div className="h-1.5 w-5/6 rounded-full bg-muted-foreground/20" />
          <div className="h-1.5 w-4/6 rounded-full bg-muted-foreground/20" />
        </div>

        <div className="flex items-end justify-between gap-3 border-t pt-3">
          <span className="text-xs text-muted-foreground">Total incl. {taxWord(country)}</span>
          <span className="text-xl font-semibold tracking-tight tabular">
            $4,290.00
          </span>
        </div>
      </div>
    </FloatingPreview>
  );
}
