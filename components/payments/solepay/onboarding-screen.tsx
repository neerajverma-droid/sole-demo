"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom, useAtomValue } from "jotai";
import {
  Building2,
  CheckCircle2,
  FileText,
  Landmark,
  MapPin,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSection } from "@/components/ui/form-section";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { TextField } from "@/components/payments/shared/onboarding-fields";
import { SolePayOnboardingShell } from "@/components/payments/solepay/onboarding-shell";
import { solePayMetaAtom, solePayOnboardingAtom } from "@/lib/atoms";
import {
  SOLEPAY_APPLICATION_STATUS_COPY,
  SOLEPAY_DOCUMENT_SLOTS,
  SOLEPAY_STEPS,
  accountsDone,
  directorDone,
  entityDone,
  formatSolePayAddress,
  requiredDocumentSlots,
  submitSolePayDraft,
  type SolePayAddress,
  type SolePayBankAccount,
  type SolePayDocuments,
  type SolePaySubmitAuthorization,
} from "@/lib/solepay";
import { cn } from "@/lib/utils";

/** Where each summary card's Add/Edit goes. Indexes into `SOLEPAY_STEPS`. */
const STEP_HREF = {
  entity: SOLEPAY_STEPS[1].href,
  directors: SOLEPAY_STEPS[2].href,
  accounts: SOLEPAY_STEPS[3].href,
  documents: SOLEPAY_STEPS[4].href,
} as const;

/**
 * The overview: what SolePay has so far, and what's still to fill in.
 *
 * Read-only. Every card is a summary of one step with a way into it, so the
 * page answers "what's left" and the steps answer "what is it" — which is why
 * the empty rows show a dash rather than being hidden. A card that dropped its
 * unanswered rows would look finished.
 *
 * Each card also reads as done, in progress, or not started — a Done badge
 * and a progress bar rather than just an Add/Edit label, so the state of the
 * whole application is visible at a glance without opening every step.
 */
export function SolePayOnboardingScreen() {
  const router = useRouter();
  const state = useAtomValue(solePayOnboardingAtom);
  const [meta] = useAtom(solePayMetaAtom);
  const [submitting, setSubmitting] = React.useState(false);

  const entityOk = entityDone(state.entity, state.address);
  const directorOk = directorDone(state.director);
  const accountsOk = accountsDone(state.bankAccounts);
  const requiredSlots = requiredDocumentSlots(
    state.bankAccounts.billingSameAsSettlement,
    state.entity.type,
    state.director.idType,
  );
  const documentsOk = requiredSlots.every((slot) => state.documents[slot] !== null);

  const readyToSubmit = entityOk && directorOk && accountsOk && documentsOk;

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [authorizedByName, setAuthorizedByName] = React.useState("");
  const [authorizationConfirmed, setAuthorizationConfirmed] = React.useState(false);

  const openConfirm = () => {
    setAuthorizedByName(
      [state.director.firstName, state.director.lastName]
        .filter(Boolean)
        .join(" ")
        .trim(),
    );
    setAuthorizationConfirmed(false);
    setConfirmOpen(true);
  };

  const submit = async (authorization: SolePaySubmitAuthorization) => {
    setSubmitting(true);
    try {
      await submitSolePayDraft(authorization);
      setConfirmOpen(false);
      toast.success("Submitted for review");
      router.push("/payments");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit for review",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canConfirmSubmit = Boolean(authorizedByName.trim()) && authorizationConfirmed;

  return (
    <SolePayOnboardingShell stepId="overview">
      {meta.applicationStatus !== "pending" && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-[14px] border p-4 text-sm",
            meta.applicationStatus === "approved"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
              : meta.applicationStatus === "declined"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
          )}
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {SOLEPAY_APPLICATION_STATUS_COPY[meta.applicationStatus].description}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard
          icon={Building2}
          title="Entity"
          description="The business SolePay settles to."
          href={STEP_HREF.entity}
          done={entityOk}
        >
          <SummaryRow label="Name" value={state.entity.name} />
          <SummaryRow label="Full legal name" value={state.entity.legalName} />
          <SummaryRow label="ABN" value={state.entity.abn} />
          <SummaryRow
            label="Type"
            value={
              ENTITY_TYPE_LABELS[state.entity.type] ?? state.entity.type
            }
          />
          <SummaryRow label="Email" value={state.entity.email} />
          <SummaryRow label="Industry" value={state.entity.industry} />
          <SummaryRow label="Website" value={state.entity.website} />
          <SummaryRow label="Phone" value={state.entity.phone} />

          <div className="space-y-2 border-t border-border pt-3">
            <p className={SUMMARY_GROUP}>
              Transaction volume
            </p>
            <SummaryRow
              label="Transactions for"
              value={state.entity.transactionsFor}
            />
            <SummaryRow label="Max txn" value={state.entity.maxTransaction} />
            <SummaryRow label="Avg txn" value={state.entity.avgTransaction} />
            <SummaryRow label="Qty txn" value={state.entity.transactionQty} />
            {/* A switch always has an answer, so this row never shows a dash —
                "No" is the setting rather than the absence of one. */}
            <SummaryRow
              label="Paid in arrears"
              value={state.entity.paidInArrears ? "Yes" : "No"}
            />
          </div>
        </SummaryCard>

        <SummaryCard
          icon={MapPin}
          title="Address"
          description="Where the business trades from."
          href={STEP_HREF.entity}
          done={entityOk}
        >
          <AddressRows address={state.address} />
          <SummaryRow
            label="Full address"
            value={formatSolePayAddress(state.address)}
          />
        </SummaryCard>

        <SummaryCard
          icon={Users}
          title="Director"
          description="Whoever signs for the business."
          href={STEP_HREF.directors}
          done={directorOk}
        >
          <SummaryRow label="First name" value={state.director.firstName} />
          <SummaryRow label="Last name" value={state.director.lastName} />
          <SummaryRow label="Email" value={state.director.email} />
          <SummaryRow label="Phone" value={state.director.phone} />
          <SummaryRow label="Date of birth" value={state.director.dateOfBirth} />
          <SummaryRow
            label="ID type"
            value={
              state.director.idType === "1"
                ? "Driving Licence"
                : state.director.idType === "2"
                  ? "Passport"
                  : state.director.idType
            }
          />
          <SummaryRow label="ID number" value={state.director.idNumber} />
          <SummaryRow
            label="Ownership"
            value={
              state.director.ownershipPercent
                ? `${state.director.ownershipPercent}%`
                : undefined
            }
          />

          <div className="space-y-2 border-t border-border pt-3">
            <p className={SUMMARY_GROUP}>
              Residential address
            </p>
            <AddressRows address={state.director.address} />
          </div>
        </SummaryCard>

        <SummaryCard
          icon={Landmark}
          title="Bank accounts"
          description="Where takings land, and where fees come out."
          href={STEP_HREF.accounts}
          done={accountsOk}
        >
          <div className="space-y-2">
            <p className={SUMMARY_GROUP}>
              Settlement
            </p>
            <BankAccountRows account={state.bankAccounts.settlement} />
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className={SUMMARY_GROUP}>Billing</p>
            {state.bankAccounts.billingSameAsSettlement ? (
              /* Said rather than repeated: printing the settlement account
                 twice would read as two accounts that happen to match. */
              <p className="text-sm text-muted-foreground">
                Same as the settlement account.
              </p>
            ) : (
              <BankAccountRows account={state.bankAccounts.billing} />
            )}
          </div>
        </SummaryCard>
      </div>

      <DocumentsCard
        documents={state.documents}
        requiredSlots={requiredSlots}
        done={documentsOk}
      />

      {readyToSubmit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Everything&rsquo;s filled in</p>
            <p className="text-xs text-muted-foreground">
              Submit for review — Worldpay verifies the details and documents above.
            </p>
          </div>
          <Button onClick={openConfirm} disabled={submitting}>
            Submit for review
          </Button>
        </div>
      )}

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!submitting) setConfirmOpen(open);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review your application</DialogTitle>
            <DialogDescription>
              Make sure everything below is correct — this is what gets sent to
              Worldpay.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <ReviewSection title="Entity">
              <SummaryRow label="Name" value={state.entity.name} />
              <SummaryRow label="Full legal name" value={state.entity.legalName} />
              <SummaryRow label="ABN" value={state.entity.abn} />
              <SummaryRow
                label="Type"
                value={ENTITY_TYPE_LABELS[state.entity.type] ?? state.entity.type}
              />
              <SummaryRow label="Email" value={state.entity.email} />
              <SummaryRow label="Phone" value={state.entity.phone} />
              <SummaryRow
                label="Address"
                value={formatSolePayAddress(state.address)}
              />
            </ReviewSection>

            <ReviewSection title="Director">
              <SummaryRow
                label="Name"
                value={[state.director.firstName, state.director.lastName]
                  .filter(Boolean)
                  .join(" ")}
              />
              <SummaryRow label="Email" value={state.director.email} />
              <SummaryRow label="Phone" value={state.director.phone} />
              <SummaryRow label="Date of birth" value={state.director.dateOfBirth} />
              <SummaryRow
                label="ID type"
                value={
                  state.director.idType === "1"
                    ? "Driving Licence"
                    : state.director.idType === "2"
                      ? "Passport"
                      : state.director.idType
                }
              />
              <SummaryRow label="ID number" value={state.director.idNumber} />
              <SummaryRow
                label="Residential address"
                value={formatSolePayAddress(state.director.address)}
              />
            </ReviewSection>

            <ReviewSection title="Bank accounts">
              <p className={SUMMARY_GROUP}>Settlement</p>
              <BankAccountRows account={state.bankAccounts.settlement} />
              <p className={cn(SUMMARY_GROUP, "pt-2")}>Billing</p>
              {state.bankAccounts.billingSameAsSettlement ? (
                <p className="text-sm text-muted-foreground">
                  Same as the settlement account.
                </p>
              ) : (
                <BankAccountRows account={state.bankAccounts.billing} />
              )}
            </ReviewSection>

            <ReviewSection title="Documents">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {SOLEPAY_DOCUMENT_SLOTS.filter((slot) =>
                  requiredSlots.includes(slot.id),
                ).map((slot) => {
                  const file = state.documents[slot.id];
                  return (
                    <div key={slot.id} className="flex items-center gap-2 text-sm">
                      <FileText
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {file ? file.name : slot.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </ReviewSection>

            <div className="space-y-3 rounded-[14px] border border-primary/20 bg-primary/[0.04] p-4">
              <p className="text-sm font-semibold">Final authorization</p>
              <TextField
                id="solepay-authorized-by-name"
                label="Authorized by (full name)"
                value={authorizedByName}
                onChange={setAuthorizedByName}
                required
                placeholder="Enter your full name"
                disabled={submitting}
              />
              <div className="flex items-start gap-2">
                <Checkbox
                  id="solepay-authorization-confirm"
                  checked={authorizationConfirmed}
                  onCheckedChange={(checked) =>
                    setAuthorizationConfirmed(checked === true)
                  }
                  disabled={submitting}
                />
                <Label
                  htmlFor="solepay-authorization-confirm"
                  className="text-xs font-normal leading-snug text-muted-foreground"
                >
                  I confirm I am a director, owner, or controller of this
                  business, and I authorize the submission of this SolePay
                  application to SolePay.
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() =>
                submit({
                  authorizedByName: authorizedByName.trim(),
                  confirmed: authorizationConfirmed,
                })
              }
              disabled={submitting || !canConfirmSubmit}
            >
              {submitting ? "Submitting…" : "Confirm & submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SolePayOnboardingShell>
  );
}

/** A labeled group of review rows inside the submit confirmation dialog. */
function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 rounded-[14px] border border-border p-4">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  "0": "Individual / Sole Proprietorship",
  "1": "Company",
  "3": "Partnership",
  "4": "Trustee",
  "5": "Non-Profit Organization",
  "6": "Government / Council / Statutory Authority",
  "7": "Association",
};

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
 * One summary card: a header that reads as done, in progress, or empty, and
 * label rows under it.
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
 * The dash rather than a blank, because a row with nothing after it reads as a
 * rendering fault — and the point of this page is to show which answers are
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

function AddressRows({ address }: { address?: SolePayAddress }) {
  return (
    <>
      <SummaryRow label="Address line 1" value={address?.line1} />
      <SummaryRow label="City" value={address?.city} />
      <SummaryRow label="State" value={address?.state} />
      <SummaryRow label="Postcode" value={address?.postcode} />
      <SummaryRow label="Country" value={address?.country} />
    </>
  );
}

function BankAccountRows({ account }: { account: SolePayBankAccount }) {
  return (
    <>
      <SummaryRow label="Account name" value={account.accountName} />
      <SummaryRow label="BSB" value={account.bsb} />
      <SummaryRow label="Account number" value={account.accountNumber} />
    </>
  );
}

/**
 * The documents card — a wide `FormSection` so the required slots and what's
 * on file both fit without the two-column squeeze the other cards use.
 */
function DocumentsCard({
  documents,
  requiredSlots,
  done,
}: {
  documents: SolePayDocuments;
  requiredSlots: readonly string[];
  done: boolean;
}) {
  const slots = SOLEPAY_DOCUMENT_SLOTS.filter((slot) =>
    requiredSlots.includes(slot.id),
  );
  const uploadedCount = slots.filter((slot) => documents[slot.id] !== null).length;

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
          <p className="text-xs font-medium text-muted-foreground">
            {uploadedCount} of {slots.length} uploaded
          </p>
          <Progress
            value={slots.length > 0 ? (uploadedCount / slots.length) * 100 : 0}
          />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {slots.map((slot) => {
          const file = documents[slot.id];
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
                {file ? file.name : slot.label}
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
