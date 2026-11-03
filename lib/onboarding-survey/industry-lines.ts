/**
 * What Pip says back once someone picks their industry.
 *
 * Ported from `sole-webapp/components/OnboardingSurveyPopup/industryLines.js`.
 * The point there — and here — is that the answer visibly *does* something:
 * each line names what Sole is about to set up for that trade, so picking an
 * industry reads as the start of setup rather than as a survey question.
 *
 * Source's `LINES` is keyed by `services/industry.services.js`'s ~23 names,
 * which do NOT match this app's `INDUSTRIES` (`lib/settings.ts`, 18 entries
 * including "Other") one-for-one — "Health and Social Care" is
 * "NDIS (Health and Social Care)" here, "Beauty" is "Make up", "Administrative"
 * is "Admin Services", and this app additionally has "Consulting", which the
 * source app never asked about at all.
 *
 * `INDUSTRY_LINE_SOURCE` below is the explicit remap: for every one of this
 * app's industries, which of source's names supplies the line. Reused
 * verbatim — no new copy invented. Two target industries share a source line
 * on purpose: "Consulting" reads as "Professional services" to Pip because
 * source never distinguished the two, and reusing that line is truer to the
 * source than writing a new one just for this port.
 *
 * "Consulting" is the one entry with no source line worth reusing under its
 * own name — closest is "Professional services", which "Professional
 * services" itself already uses, so giving Consulting the exact same wording
 * would read as though a `Consulting` industry had never been anticipated. It
 * falls back to source's own generic line instead (see `industryLine`).
 *
 * This same table is the one judgement call `pin-suggestions.ts` and
 * `first-actions.ts` also make (each keeps its own copy, since each is a
 * small, self-contained port mirroring its own source file) — keep the three
 * in agreement if a mapping ever changes here.
 */

/** Source's own lines, kept verbatim — `services/industry.services.js`'s names. */
const SOURCE_LINES: Record<string, string> = {
  Administrative: "Admin it is — invoices, subscriptions and software, sorted.",
  Arts: "An artist! Materials, studio costs and commissions coming up.",
  Beauty: "Lovely — products, tools and chair rent are all claimable.",
  Construction: "Site work. Materials, plant hire and travel are ready to go.",
  Creatives: "Creative work. Software, gear and subcontractors, coming up.",
  Finance: "Finance. I'll watch the client billing and compliance costs.",
  "Fitness and Wellbeing":
    "Fitness — equipment, insurance and space hire, all set.",
  "Food services": "Food! Stock, ingredients and kitchen gear are ready.",
  "Health and Social Care":
    "Health and care work — I'll set you up for NDIS-style invoicing too.",
  Influencer: "Content creator — gear, subscriptions and travel are in.",
  Insurance: "Insurance. Commissions and client costs, tracked.",
  Manufacturer: "Manufacturing — materials and stock are set up.",
  "Professional services": "Professional services — billable time, sorted.",
  Retail: "Retail — stock, sales and card fees are ready.",
  Trades: "A tradie! Tools, materials and ute expenses are ready for you.",
  Transport: "Transport — fuel, tolls and vehicle costs are set up.",
  Other: "No worries, Other works. You can fine-tune categories any time.",
};

/**
 * This app's industry name → the source industry name whose line it reuses.
 *
 * `null` means no source line fits closely enough to reuse — `industryLine`
 * falls through to source's own generic fallback for those.
 */
export const INDUSTRY_LINE_SOURCE: Record<string, string | null> = {
  "Admin Services": "Administrative",
  Arts: "Arts",
  "Make up": "Beauty",
  Construction: "Construction",
  Creatives: "Creatives",
  Finance: "Finance",
  "Personal Trainers / Fitness": "Fitness and Wellbeing",
  "Food services": "Food services",
  "NDIS (Health and Social Care)": "Health and Social Care",
  Consulting: null,
  Influencers: "Influencer",
  Insurance: "Insurance",
  Manufacturers: "Manufacturer",
  "Professional services": "Professional services",
  Retail: "Retail",
  Trades: "Trades",
  "Transport & logistics": "Transport",
  Other: "Other",
};

/**
 * The reaction line for an industry, given this app's own industry name.
 *
 * Unknown names — including "Consulting", and anything typed in free text —
 * fall back to source's own generic line rather than a blank or a guess.
 */
export default function industryLine(name = ""): string {
  const sourceName = INDUSTRY_LINE_SOURCE[name];
  const line = sourceName ? SOURCE_LINES[sourceName] : undefined;
  return line ?? `Got it — ${name}. I'll tune your categories for that.`;
}
