"use client";

import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Download,
  Landmark,
  MousePointerClick,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FloatingPreview,
  OnboardingHero,
} from "@/components/layout/onboarding-hero";
import { WARM_TILE } from "@/components/layout/page-header";
import { useCountryContext } from "@/hooks/use-country-context";
import { bankFeedName } from "@/lib/country-context";
import { cn } from "@/lib/utils";

/** The pre-connection onboarding state, per the prototype's intro view. */
export function TransactionsIntro({
  onConnect,
  onManualEntry,
  onBulkUpload,
}: {
  onConnect: () => void;
  onManualEntry: () => void;
  onBulkUpload: () => void;
}) {
  const { country } = useCountryContext();

  return (
    <OnboardingHero
      eyebrow="Transactions"
      title="Connect your bank to match transactions"
      body="Link your bank account to Sole and turn on a secure live feed — every payment is imported and matched to the right invoice or bill automatically."
      benefits={[
        {
          icon: ShieldCheck,
          title: "Secure live bank feed",
          body: `Bank-grade connection via ${bankFeedName(country)} — transactions appear the moment they clear.`,
        },
        {
          icon: Landmark,
          title: "Automatic matching",
          body: "Sole pairs each transaction with an invoice or bill, so reconciling takes seconds.",
        },
        {
          icon: MousePointerClick,
          title: "One-click reconcile",
          body: "Confirm the matches and your books stay accurate and BAS-ready all year.",
        },
      ]}
      actions={
        <Button onClick={onConnect}>
          <Landmark />
          Connect bank account
        </Button>
      }
      caption="Takes about 2 minutes · read-only & bank-grade secure"
      secondary={{
        label: "or add transactions manually:",
        children: (
          <>
            <Button variant="outline" size="sm" onClick={onBulkUpload}>
              Manual bulk upload
            </Button>
            <Button variant="outline" size="sm" onClick={onManualEntry}>
              Manual entry
            </Button>
          </>
        ),
      }}
      preview={<BankFeedPreview />}
      lifecycle={{
        title: "The life of a transaction",
        trunk: [
          { label: "Bank feed", icon: Landmark },
          { label: "Imported to Sole", icon: Download },
        ],
        branches: [
          {
            label: "Matched → reconciled",
            icon: CircleCheck,
            tone: "success",
            glow: true,
          },
          { label: "Needs review", icon: TriangleAlert, tone: "warning" },
        ],
        body: "Sole imports every transaction from your bank feed and matches it to an invoice or bill automatically. Anything it can't match is flagged for a quick review — so your books are always reconciled.",
      }}
    />
  );
}

/** A still of the feed you get once connected. */
function BankFeedPreview() {
  const rows = [
    {
      desc: "Deposit — Nomad Studio",
      meta: "Matched",
      amount: "+$4,290.00",
      direction: "in" as const,
    },
    {
      desc: "Stripe payout",
      meta: "Needs review",
      amount: "+$1,120.00",
      direction: "in" as const,
      review: true,
    },
    {
      desc: "Officeworks Melbourne",
      meta: "Matched",
      amount: "−$182.40",
      direction: "out" as const,
    },
  ];

  return (
    <FloatingPreview stamp={{ label: "Matched", tone: "success" }}>
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            aria-hidden
          >
            <Landmark className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">ANZ Business</p>
            <p className="text-xs text-muted-foreground tabular">•••• 4821</p>
          </div>
        </div>

        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.desc}
              className="flex items-center gap-2.5 rounded-md border border-border p-2.5"
            >
              {/* Money in points up in green; money out points down, warm. */}
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-md",
                  row.direction === "in"
                    ? "bg-success/10 text-success"
                    : WARM_TILE,
                )}
                aria-hidden
              >
                {row.direction === "in" ? (
                  <ArrowUp className="size-3.5" />
                ) : (
                  <ArrowDown className="size-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{row.desc}</p>
                <p
                  className={
                    row.review
                      ? "text-[11px] text-warning"
                      : "text-[11px] text-success"
                  }
                >
                  {row.meta}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular">
                {row.amount}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </FloatingPreview>
  );
}
