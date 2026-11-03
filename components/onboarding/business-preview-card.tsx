"use client";

import { useAtomValue } from "jotai";
import { Building2, Hash, Mail, Tag } from "lucide-react";

import { authEmailAtom, authNameAtom } from "@/lib/atoms";
import { titleCaseName } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { useOnboardingFlowStore } from "@/stores/onboarding-flow";
import { useCountriesQuery } from "@/hooks/use-countries-query";
import { countryByIso2 } from "@/lib/countries";
import { registrationField } from "@/lib/business-identifier";

/** Shown until the field has something in it. */
const EMPTY = "—";

/**
 * The business as it will appear, filling in as it's typed.
 *
 * A dark hero card, and deliberately the one thing on this page that isn't a
 * form surface. The fields on the right are abstract on their own — an ABN, a
 * trading name — and the point of this is to show them landing somewhere that
 * looks like a finished artefact rather than like another input. Making it the
 * same white card as the form beside it collapses that distinction, which is
 * how it ends up reading as a second panel of the same thing.
 *
 * `bg-hero` rather than a fixed dark colour: the token is near-black in light
 * mode and a lifted charcoal in dark, so the card stays the darkest surface on
 * the page in both themes instead of becoming the lightest one at night.
 *
 * It reads the draft store directly rather than taking a prop. The form writes
 * to the same store, so this is a view of the draft rather than something the
 * form has to remember to hand down.
 */
export function BusinessPreviewCard() {
  const draft = useOnboardingFlowStore((state) => state.profile);
  const email = useAtomValue(authEmailAtom);
  const accountName = useAtomValue(authNameAtom);

  const { data: countries = [] } = useCountriesQuery();
  /** What the chosen country calls its business number — "ABN", "NZBN", … */
  const identifierLabel =
    registrationField(
      countryByIso2(countries, draft.countryIso2)?.identifierSchema ?? [],
    )?.label ?? "Business number";

  const businessName = draft.businessName.trim();
  /*
   * From the draft, not `authNameAtom`. The name is asked for on this very
   * screen now rather than at sign-up, so the atom it used to be written to is
   * empty — the card showed "Managed by" nobody. Falls back to the atom for an
   * account that signed up before the move and still has one.
   */
  const contact = titleCaseName(draft.fullName.trim() || accountName);

  return (
    <div className="overflow-hidden rounded-2xl border border-hero-border bg-hero shadow-lg">
      {/*
        A 1px strip of the brand's two chart colours across the top edge.

        Money in to money out, which is the gradient this product uses wherever
        it needs to say "business" in one mark. It's the only colour on an
        otherwise monochrome card, so it reads as a seam rather than decoration
        — and it sits outside the padded body so it meets both corners.
      */}
      <div
        className="h-px w-full bg-gradient-to-r from-chart-in via-chart-in/60 to-chart-out"
        aria-hidden
      />

      <div className="p-6">
        <div className="flex items-center gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-hero-raised text-hero-foreground"
            aria-hidden
          >
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            {/*
              The placeholder is dimmed rather than italicised or bracketed, so
              the moment a name is typed the line changes weight instead of
              changing shape — the card settles rather than redraws.
            */}
            <p
              className={cn(
                "truncate text-base font-semibold",
                businessName ? "text-hero-foreground" : "text-hero-muted/60",
              )}
            >
              {businessName || "Your Business Name"}
            </p>
            {/*
              The account's own email, not a line about invoices.

              It's the one fact on this card that's already true — it's how they
              signed up — so it does the work of showing the card is about them
              rather than a mockup of nobody.
            */}
            <p className="flex items-center gap-1.5 truncate text-xs text-hero-muted/70">
              <Mail className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{email || "you@business.com.au"}</span>
            </p>
          </div>
        </div>

        <dl className="mt-6 space-y-3 border-t border-hero-border/60 pt-5">
          {/*
            No industry row: that question moved to the post-signup survey, so
            this card was showing a dash for something the form no longer asks.
          */}
          <Row
            icon={Hash}
            // The country's own word for it — an ABN in Australia, an NZBN in
            // New Zealand. A card headed "ABN" above a 13-digit NZBN was
            // labelling it as the wrong country's number.
            label={identifierLabel}
            value={draft.abn.trim() || EMPTY}
            tabular
          />
        </dl>

        {/*
          The person, as a footer rather than a row.

          It isn't a property of the business the way the industry and the ABN
          are — it's who holds the account — so putting it in the same list
          would be filing a fact about a person under facts about a company.
          Below a rule, in the card's quietest type.
        */}
        {contact && (
          <p className="mt-5 border-t border-hero-border/60 pt-4 text-xs text-hero-muted/60">
            Managed by {contact}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A labelled fact: icon and label on the left, value right-aligned.
 *
 * `tabular` only where the value is digits — proportional numerals make a
 * column of figures ragged, and everything else here is words, which the
 * tabular face would make look typed into a form rather than printed.
 */
function Row({
  icon: Icon,
  label,
  value,
  tabular,
}: {
  icon: typeof Tag;
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex shrink-0 items-center gap-2 text-xs uppercase tracking-wider text-hero-muted/60">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right text-sm font-medium text-hero-foreground",
          tabular && "tabular",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
