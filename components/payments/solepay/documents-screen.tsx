"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { FileText, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { DocumentDropZone } from "@/components/payments/shared/onboarding-fields";
import {
  SolePayOnboardingShell,
  SolePayStepFooter,
  SOLEPAY_OVERVIEW_HREF,
  useSolePayHydration,
} from "@/components/payments/solepay/onboarding-shell";
import { solePayMetaAtom, solePayOnboardingAtom } from "@/lib/atoms";
import { toIsoDate } from "@/lib/invoices";
import {
  SOLEPAY_DOCUMENT_SLOTS,
  SOLEPAY_IMAGE_OR_PDF_ACCEPT,
  SOLEPAY_PDF_ONLY_ACCEPT,
  SOLEPAY_STEPS,
  accountsDone,
  requiredDocumentSlots,
  solepayFileIssue,
  uploadSolePayDocuments,
  type SolePayDocumentSlotId,
  type SolePayDocuments,
} from "@/lib/solepay";

const SECTION_HEADER =
  "gap-3 px-4 py-3.5 bg-primary/[0.06] dark:bg-primary/[0.12]";

/** The Accounts step, for the banner's way out. */
const ACCOUNTS_HREF = SOLEPAY_STEPS[3].href;

/**
 * Documents.
 *
 * The last step, and the only one that depends on another: SolePay verifies a
 * bank statement against the account it was given, so there's nothing to check
 * it against until the Accounts step is saved. That dependency is the banner at
 * the top and the disabled state on everything below it — offering an upload
 * that can't be matched to anything would be a form that accepts work and then
 * wastes it.
 *
 * The slots follow the accounts too: mirrored billing is one account, so it's
 * one statement. See `requiredDocumentSlots`.
 */
export function SolePayDocumentsScreen() {
  const router = useRouter();
  const [state, setState] = useAtom(solePayOnboardingAtom);
  const setMeta = useSetAtom(solePayMetaAtom);

  const [documents, setDocuments] = React.useState<SolePayDocuments>(
    state.documents,
  );
  /** New local selections not yet sent to Worldpay — what Save actually uploads. */
  const [pendingFiles, setPendingFiles] = React.useState<
    Partial<Record<SolePayDocumentSlotId, File>>
  >({});
  /** Why the last file picked for a slot was turned away, keyed by slot. */
  const [fileErrors, setFileErrors] = React.useState<
    Partial<Record<SolePayDocumentSlotId, string>>
  >({});
  const [saving, setSaving] = React.useState(false);

  // Re-seeds from the atom once the real draft has actually loaded — see
  // `useSolePayHydration`'s own comment for why the plain `useState` above
  // isn't enough by itself on a hard refresh landing straight on this page.
  useSolePayHydration(() => setDocuments(state.documents));

  const mirrored = state.bankAccounts.billingSameAsSettlement;
  const ready = accountsDone(state.bankAccounts);

  /*
   * The slots on screen, and the ones that have to be filled — the same list,
   * because every slot shown here is required. A slot that's hidden isn't
   * optional, it's not being asked. Trust Agreement only appears for a
   * Trustee entity, the same rule Worldpay's own backend applies.
   */
  const required = requiredDocumentSlots(mirrored, state.entity.type, state.director.idType);
  const slots = SOLEPAY_DOCUMENT_SLOTS.filter((slot) =>
    required.includes(slot.id),
  );

  const missing = required.filter((slot) => documents[slot] === null);

  const attach = async (slot: SolePayDocumentSlotId, file: File) => {
    const pdfOnly = Boolean(
      SOLEPAY_DOCUMENT_SLOTS.find((candidate) => candidate.id === slot)
        ?.pdfOnly,
    );
    const issue = await solepayFileIssue(file, pdfOnly);
    if (issue) {
      setFileErrors((current) => ({ ...current, [slot]: issue }));
      return;
    }
    setFileErrors((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
    setPendingFiles((current) => ({ ...current, [slot]: file }));
    setDocuments((current) => ({
      ...current,
      [slot]: { name: file.name, uploadedAt: toIsoDate(new Date()) },
    }));
  };

  const clear = (slot: SolePayDocumentSlotId) => {
    setFileErrors((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
    setPendingFiles((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
    // Reverts to whatever Worldpay actually holds for this slot, not to
    // blank — clearing a fresh local pick shouldn't also drop an upload
    // that's already gone through.
    setDocuments((current) => ({ ...current, [slot]: state.documents[slot] }));
  };

  const save = async () => {
    if (missing.length > 0) {
      toast.error(
        `${missing.length} ${missing.length === 1 ? "document is" : "documents are"} still needed`,
      );
      return;
    }

    if (Object.keys(pendingFiles).length === 0) {
      router.push(SOLEPAY_OVERVIEW_HREF);
      return;
    }

    setSaving(true);
    try {
      const result = await uploadSolePayDocuments(pendingFiles, mirrored);
      setState((current) => ({ ...current, documents: result.documents }));
      setMeta(result.meta);
      setPendingFiles({});
      toast.success("Documents uploaded");
      router.push(SOLEPAY_OVERVIEW_HREF);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload documents",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SolePayOnboardingShell stepId="documents">
      <div className="space-y-4">
        {/*
          The dependency, said before the thing it blocks.

          Amber rather than red: nothing has gone wrong, there's just a step to
          do first — and it links there rather than only naming it.
        */}
        {!ready && (
          <div className="flex items-start gap-3 rounded-[14px] border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 space-y-2">
              <p className="text-sm leading-relaxed">
                Save your bank accounts in the Accounts tab to enable document
                upload.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-[9px] border-amber-300 bg-transparent text-amber-900 hover:bg-amber-100 dark:border-amber-400/40 dark:text-amber-100 dark:hover:bg-amber-500/20"
                asChild
              >
                <Link href={ACCOUNTS_HREF}>Go to accounts</Link>
              </Button>
            </div>
          </div>
        )}

        <FormSection
          icon={FileText}
          title="Documents"
          description="The paperwork that verifies everything above."
          headerClassName={SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          {mirrored && ready && (
            <p className="text-xs text-muted-foreground">
              Billing mirrors settlement, so one bank statement covers both.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {slots.map((slot) => (
              <DocumentDropZone
                key={slot.id}
                title={slot.label}
                hint={slot.hint}
                file={documents[slot.id]}
                disabled={!ready}
                accept={
                  slot.pdfOnly
                    ? SOLEPAY_PDF_ONLY_ACCEPT
                    : SOLEPAY_IMAGE_OR_PDF_ACCEPT
                }
                acceptLabel={
                  slot.pdfOnly
                    ? "PDF only · max 20 MB"
                    : "PNG, JPG or PDF · max 20 MB"
                }
                error={fileErrors[slot.id]}
                onSelect={(file) => void attach(slot.id, file)}
                onClear={() => clear(slot.id)}
              />
            ))}
          </div>
        </FormSection>
      </div>

      <SolePayStepFooter
        onSave={save}
        saveDisabled={!ready || saving}
        saveLabel={
          saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Uploading…
            </>
          ) : (
            "Upload documents"
          )
        }
      />
    </SolePayOnboardingShell>
  );
}
