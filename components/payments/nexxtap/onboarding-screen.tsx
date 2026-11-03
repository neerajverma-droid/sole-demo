"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom, useAtomValue } from "jotai";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  Landmark,
  Pencil,
  Plus,
  User,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Progress } from "@/components/ui/progress";
import { NexxtapOnboardingShell } from "@/components/payments/nexxtap/onboarding-shell";
import {
  nexxtapDocumentsAtom,
  nexxtapMetaAtom,
  nexxtapOnboardingAtom,
} from "@/lib/atoms";
import {
  NEXXTAP_DOCUMENT_SLOTS,
  NEXXTAP_STEPS,
  NEXXTAP_SUBSCRIPTION_FREQUENCIES,
  NEXXTAP_SUBSCRIPTION_TERMS,
  activityDone,
  applicantDone,
  bankDone,
  businessDone,
  documentsDone,
  facilitiesDone,
  hasTrust,
  isWithNexxtap,
  ownersDone,
  parseNexxtapErrors,
  requiredDocumentSlots,
  submitNexxtapApplication,
  type NexxtapOnboarding,
  type NexxtapUploadedDocument,
} from "@/lib/nexxtap";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

/** Where each summary card's Add/Edit goes. Indexes into `NEXXTAP_STEPS`. */
const STEP_HREF = {
  business: NEXXTAP_STEPS[1].href,
  applicant: NEXXTAP_STEPS[2].href,
  owners: NEXXTAP_STEPS[3].href,
  activity: NEXXTAP_STEPS[4].href,
  facilities: NEXXTAP_STEPS[5].href,
  bank: NEXXTAP_STEPS[6].href,
  documents: NEXXTAP_STEPS[7].href,
} as const;

const yesNo = (value: string) => (String(value) === "1" ? "Yes" : "No");

const labelFor = (
  options: readonly { id: string; name: string }[],
  value: string,
) => options.find((option) => option.id === value)?.name || value;

/**
 * The overview: what NextTap has so far, and what's still to fill in.
 *
 * Read-only. Every card is a summary of one step with a way into it, so the
 * page answers "what's left" and the steps answer "what is it" — which is why
 * the empty rows show a dash rather than being hidden. A card that dropped
 * its unanswered rows would look finished.
 *
 * Submitting lives here rather than on the last step, because it's the one
 * action that needs every step to be done — and this is the only page that
 * can see all of them.
 */
export function NexxtapOnboardingScreen() {
  const router = useRouter();
  const state = useAtomValue(nexxtapOnboardingAtom);
  const documents = useAtomValue(nexxtapDocumentsAtom);
  const [meta, setMeta] = useAtom(nexxtapMetaAtom);
  const [submitting, setSubmitting] = React.useState(false);

  const done = {
    business: businessDone(state),
    applicant: applicantDone(state),
    owners: ownersDone(state),
    activity: activityDone(state),
    facilities: facilitiesDone(state),
    bank: bankDone(state),
    documents: documentsDone(state, documents),
  };

  const readyToSubmit = Object.values(done).every(Boolean);
  const sent = isWithNexxtap(meta);

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await submitNexxtapApplication(state, meta);
      setMeta({
        ...meta,
        applicationId: result.applicationId,
        submitted: true,
        // An update leaves the status where NextTap had it; a first submit is
        // what moves it off the draft ladder.
        status: result.isUpdate ? meta.status : "submitted",
      });
      toast.success(
        result.isUpdate
          ? "NextTap application updated"
          : "NextTap application submitted",
      );
      router.push("/transactions/payments");
    } catch (error) {
      /*
       * NextTap rejects an application field by field rather than with one
       * message, so each one gets its own line — a lone "submission failed"
       * would hide which of thirty answers it actually objected to.
       */
      const { fieldErrors, message } = parseNexxtapErrors(error);
      if (fieldErrors.length > 0) {
        for (const fieldError of fieldErrors) {
          toast.error(
            `${fieldError.section}${fieldError.field ? ` — ${fieldError.field}` : ""}`,
            { description: fieldError.messages.join(" "), duration: 8000 },
          );
        }
        toast.warning(
          `${fieldErrors.length} ${fieldErrors.length === 1 ? "field needs" : "fields need"} attention`,
          {
            description:
              "Open the step it belongs to, correct it, then submit again.",
            duration: 9000,
          },
        );
      } else {
        toast.error(message || "Couldn't submit the application. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <NexxtapOnboardingShell stepId="overview">
      {/* What NextTap has said about an application that's already with them.
          Nothing at all before it's been sent. */}
      {meta.status === "approved" && (
        <StatusBanner tone="good">
          Your NextTap account has been approved — you can start taking taps.
        </StatusBanner>
      )}
      {meta.status === "declined" && (
        <StatusBanner tone="bad">
          NextTap declined this application. Check your details and resubmit, or
          contact support.
        </StatusBanner>
      )}
      {meta.status === "needs_update" && (
        <StatusBanner tone="warn">
          NextTap needs something changed before it can board you. Correct the
          details below and update the application.
        </StatusBanner>
      )}
      {sent && meta.status !== "approved" && (
        <StatusBanner tone="warn">
          Your application is with NextTap. You can still change your answers
          and send an update while it&rsquo;s under review.
        </StatusBanner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard
          icon={Building2}
          title="Business"
          description="The business NextTap will be boarding."
          href={STEP_HREF.business}
          done={done.business}
        >
          <SummaryRow label="Business name" value={state.business.business_name} />
          <SummaryRow label="Trading name" value={state.business.doing_business_as} />
          <SummaryRow label="ABN" value={state.business.abn} />
          <SummaryRow
            label="Status"
            value={
              state.business.new_or_existing_business === "new"
                ? "New business"
                : "Existing business"
            }
          />
          <SummaryRow label="Industry" value={state.business.industry_type} />
          <SummaryRow
            label="Product / service"
            value={state.business.product_or_service}
          />
          <SummaryRow
            label="Support phone"
            value={state.business.contact_support_number}
          />
          <SummaryRow label="Website" value={state.business.website} />
          <SummaryRow label="Instagram" value={state.business.instagram_profile} />
          <SummaryRow label="Facebook" value={state.business.facebook_profile} />

          <div className="space-y-2 border-t border-border pt-3">
            <p className={SUMMARY_GROUP}>
              Business address
            </p>
            <SummaryRow
              label="Street address"
              value={state.business.business_address}
            />
            <SummaryRow label="City" value={state.business.city} />
            <SummaryRow label="State" value={state.business.state} />
            <SummaryRow label="Post code" value={state.business.post_code} />
          </div>
        </SummaryCard>

        <SummaryCard
          icon={User}
          title="Authorised applicant"
          description="Whoever signs for the business."
          href={STEP_HREF.applicant}
          done={done.applicant}
        >
          <SummaryRow label="First name" value={state.applicant.first_name} />
          <SummaryRow label="Middle name" value={state.applicant.middle_name} />
          <SummaryRow label="Last name" value={state.applicant.last_name} />
          <SummaryRow label="Date of birth" value={state.applicant.date_of_birth} />
          <SummaryRow label="Position" value={state.applicant.position} />
          <SummaryRow label="Contact number" value={state.applicant.contact_number} />
          <SummaryRow label="Email" value={state.applicant.email} />
          <SummaryRow
            label="Notifications"
            value={
              String(state.applicant.dont_send_notifications_to_merchant) === "1"
                ? "Do not send"
                : "Send notifications"
            }
          />

          <div className="space-y-2 border-t border-border pt-3">
            <p className={SUMMARY_GROUP}>
              Residential address
            </p>
            <SummaryRow label="Street address" value={state.applicant.address} />
            <SummaryRow label="City" value={state.applicant.city} />
            <SummaryRow label="State" value={state.applicant.state} />
            <SummaryRow label="Post code" value={state.applicant.post_code} />
          </div>
        </SummaryCard>

        <SummaryCard
          icon={Users}
          title="Beneficial owners"
          description="Everyone who ultimately owns the business."
          href={STEP_HREF.owners}
          done={done.owners}
        >
          {state.owners.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No owners added yet.
            </p>
          ) : (
            state.owners.map((owner, index) => (
              <div
                key={index}
                className={cn(
                  "space-y-2",
                  index > 0 && "border-t border-border pt-3",
                )}
              >
                <p className={SUMMARY_GROUP}>
                  Owner {index + 1}
                </p>
                <SummaryRow
                  label="Name"
                  value={[owner.first_name, owner.last_name]
                    .filter(Boolean)
                    .join(" ")}
                />
                <SummaryRow label="Position" value={owner.position} />
                <SummaryRow label="Email" value={owner.email} />
                <SummaryRow label="Contact number" value={owner.contact_number} />
                <SummaryRow
                  label="Address"
                  value={[
                    owner.residential_address,
                    owner.city,
                    owner.state,
                    owner.post_code,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                />
              </div>
            ))
          )}
        </SummaryCard>

        <SummaryCard
          icon={CreditCard}
          title="Business activity"
          description="How the business trades, and how much."
          href={STEP_HREF.activity}
          done={done.activity}
        >
          <SummaryRow
            label="Held in a trust"
            value={yesNo(state.activity.company_have_a_trust)}
          />
          {hasTrust(state.activity) && (
            <SummaryRow label="Trust name" value={state.activity.trust_name} />
          )}
          <SummaryRow
            label="Facility ever terminated"
            value={yesNo(state.activity.had_a_merchant_facility_terminated)}
          />
          <SummaryRow
            label="Current facilities"
            value={yesNo(state.activity.currently_have_any_merchant_facilities)}
          />
          <SummaryRow
            label="Annual turnover"
            value={
              state.activity.estimated_annual_turnover
                ? `${activeCurrencySymbol()}${Number(state.activity.estimated_annual_turnover).toLocaleString()}`
                : undefined
            }
          />
          <SummaryRow
            label="Card sales a month"
            value={state.activity.average_number_of_credit_card_sales_per_month}
          />

          <div className="space-y-2 border-t border-border pt-3">
            <p className={SUMMARY_GROUP}>
              Payment mix
            </p>
            <SummaryRow
              label="Face-to-face"
              value={
                state.activity.face_to_face_usage_percentage
                  ? `${state.activity.face_to_face_usage_percentage}%`
                  : undefined
              }
            />
            <SummaryRow
              label="Ecommerce"
              value={
                state.activity.ecommerce_usage_percentage
                  ? `${state.activity.ecommerce_usage_percentage}%`
                  : undefined
              }
            />
          </div>
        </SummaryCard>

        <SummaryCard
          icon={WalletCards}
          title="Facilities"
          description="What NextTap switches on."
          href={STEP_HREF.facilities}
          done={done.facilities}
        >
          <SummaryRow
            label="Devices"
            value={state.facilities.selected_devices
              .map((device) => (device === "ios" ? "iOS" : "Android"))
              .join(", ")}
          />
          <SummaryRow
            label="Ecommerce facility"
            value={yesNo(state.facilities.require_online_ecomm_facility)}
          />
          <SummaryRow
            label="NexxPOS"
            value={yesNo(state.facilities.require_online_nexxpos_facility)}
          />
          <SummaryRow
            label="American Express"
            value={yesNo(state.facilities.require_online_amex_facility)}
          />
          <SummaryRow
            label="Customer pays surcharge"
            value={yesNo(state.facilities.customer_pays_surcharge)}
          />

          <div className="space-y-2 border-t border-border pt-3">
            <p className={SUMMARY_GROUP}>
              Subscriptions
            </p>
            <SummaryRow
              label="Charges subscriptions"
              value={yesNo(
                state.facilities.do_you_process_subscriptions_or_memberships,
              )}
            />
            {String(
              state.facilities.do_you_process_subscriptions_or_memberships,
            ) === "1" && (
              <>
                <SummaryRow
                  label="Term"
                  value={labelFor(
                    NEXXTAP_SUBSCRIPTION_TERMS,
                    state.facilities.term_of_your_subscription,
                  )}
                />
                <SummaryRow
                  label="Frequency"
                  value={labelFor(
                    NEXXTAP_SUBSCRIPTION_FREQUENCIES,
                    state.facilities.frequency_of_subscriptions,
                  )}
                />
              </>
            )}
          </div>
        </SummaryCard>

        <SummaryCard
          icon={Landmark}
          title="Settlement account"
          description="Where NextTap pays the takings."
          href={STEP_HREF.bank}
          done={done.bank}
        >
          <SummaryRow label="Account name" value={state.bank.account_name} />
          <SummaryRow label="BSB" value={state.bank.bsb} />
          <SummaryRow label="Account number" value={state.bank.account_number} />
          <SummaryRow label="Bank" value={state.bank.bank_name} />
        </SummaryCard>
      </div>

      <DocumentsCard
        state={state}
        documents={documents}
        done={done.documents}
      />

      {readyToSubmit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Everything&rsquo;s filled in</p>
            <p className="text-xs text-muted-foreground">
              {meta.submitted
                ? "Send your changes to NextTap — they'll re-check the details and documents above."
                : "Submit to NextTap — they verify the details and documents above."}
            </p>
          </div>
          <Button onClick={submit} disabled={submitting}>
            {submitting
              ? meta.submitted
                ? "Updating…"
                : "Submitting…"
              : meta.submitted
                ? "Update application"
                : "Submit application"}
          </Button>
        </div>
      )}
    </NexxtapOnboardingShell>
  );
}

function StatusBanner({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[14px] border p-4 text-sm",
        tone === "good" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
        tone === "warn" &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
        tone === "bad" && "border-destructive/30 bg-destructive/5 text-destructive",
      )}
    >
      <CheckCircle2 className="size-4 shrink-0" aria-hidden />
      {children}
    </div>
  );
}

/**
 * Overview card headers sit on the card itself — no wash. A tinted band on
 * every card turned the page into a patchwork of green and indigo strips, and
 * the done state is now carried by the badge beside Edit instead.
 * `bg-card` rather than nothing because `FormSection` lays its own faint wash
 * down by default.
 */
const SUMMARY_HEADER = "gap-3 bg-card px-4 py-3.5";

/** A group title inside a card ("Transaction volume", "Settlement"…). */
const SUMMARY_GROUP =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

/** A card's way into its step, with a "Done" badge once the step is answered. */
function SummaryAction({ href, done }: { href: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done && (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="size-3" aria-hidden />
          Done
        </Badge>
      )}
      <Button variant="ghost" size="sm" asChild>
        <Link href={href}>
          {done ? <Pencil /> : <Plus />}
          {done ? "Edit" : "Add"}
        </Link>
      </Button>
    </div>
  );
}

/**
 * One summary card: a header that reads as done or not, and label rows under
 * it.
 *
 * `done` adds a "Done" badge and swaps the action to "Edit" — matching
 * done/not-done everywhere else on the platform, rather than a card that only
 * ever says "Add".
 */
function SummaryCard({
  icon,
  title,
  description,
  href,
  done,
  children,
}: {
  icon: React.ComponentProps<typeof FormSection>["icon"];
  title: string;
  description: string;
  href: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <FormSection
      icon={icon}
      title={title}
      description={description}
      headerClassName={SUMMARY_HEADER}
      className="space-y-3 p-4"
      action={
        <SummaryAction href={href} done={done} />
      }
    >
      {children}
    </FormSection>
  );
}

/**
 * A label and what's been answered, or an em dash.
 *
 * The dash rather than a blank, because a row with nothing after it reads as
 * a rendering fault — and the point of this page is to show which answers are
 * still missing, which needs the gap to be visible.
 */
function SummaryRow({ label, value }: { label: string; value?: string }) {
  const answered = !!value && value.trim().length > 0;

  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <dt className="shrink-0 text-sm font-medium text-foreground">{label}</dt>
      <dd
        className={
          answered
            ? "min-w-0 truncate text-right text-sm font-normal text-muted-foreground tabular"
            : "text-right text-sm text-muted-foreground/60"
        }
      >
        {answered ? value : "—"}
      </dd>
    </div>
  );
}

/**
 * The documents card — a wide `FormSection` so the slots and what's on file
 * both fit without the two-column squeeze the other cards use.
 *
 * Only the required slots are counted in the progress: the optional three
 * help approval along but can't hold the step open, so counting them would
 * show a bar that never fills for most merchants.
 */
function DocumentsCard({
  state,
  documents,
  done,
}: {
  state: NexxtapOnboarding;
  documents: NexxtapUploadedDocument[];
  done: boolean;
}) {
  const required = requiredDocumentSlots(hasTrust(state.activity));
  const slots = NEXXTAP_DOCUMENT_SLOTS.filter((slot) =>
    required.includes(slot.id),
  );
  const held = new Set(documents.map((document) => document.document_type));
  const uploaded = slots.filter((slot) => held.has(slot.id)).length;

  return (
    <FormSection
      icon={FileText}
      title="Documents"
      description="The paperwork that verifies everything above."
      headerClassName={SUMMARY_HEADER}
      action={
        <SummaryAction href={STEP_HREF.documents} done={done} />
      }
    >
      {!done && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground tabular">
            {uploaded} of {slots.length} uploaded
          </p>
          <Progress
            value={slots.length > 0 ? (uploaded / slots.length) * 100 : 0}
          />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {slots.map((slot) => {
          const file = documents.find(
            (document) => document.document_type === slot.id,
          );
          return (
            <div
              key={slot.id}
              className={cn(
                "flex items-center gap-2 rounded-[9px] border px-3 py-2 text-sm",
                file
                  ? "border-border"
                  : "border-dashed border-border text-muted-foreground",
              )}
            >
              <FileText className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {file ? file.original_filename : slot.label}
              </span>
              {!file && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  Needed
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </FormSection>
  );
}
