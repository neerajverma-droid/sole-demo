"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom, useAtomValue } from "jotai";
import { FileText, Info, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { DocumentDropZone } from "@/components/payments/shared/onboarding-fields";
import {
  NexxtapOnboardingShell,
  NexxtapStepFooter,
  NEXXTAP_OVERVIEW_HREF,
  NEXXTAP_SECTION_HEADER,
} from "@/components/payments/nexxtap/onboarding-shell";
import { apiErrorMessage } from "@/lib/api-error";
import { nexxtapDocumentsAtom, nexxtapOnboardingAtom } from "@/lib/atoms";
import {
  NEXXTAP_ACCEPT_ATTR,
  NEXXTAP_DOCUMENT_SLOTS,
  NEXXTAP_STEPS,
  bankDone,
  deleteNexxtapDocument,
  fetchNexxtapDocuments,
  hasTrust,
  nexxtapFileIssue,
  requiredDocumentSlots,
  uploadNexxtapDocuments,
  type NexxtapDocumentSlotId,
} from "@/lib/nexxtap";

/** The Bank step, for the banner's way out. */
const BANK_HREF = NEXXTAP_STEPS[6].href;

/**
 * Supporting documents.
 *
 * The last step, and the only one that depends on another: NextTap verifies
 * the bank statement against the account it was given, so there's nothing to
 * check it against until the Bank step is saved. That dependency is the
 * banner at the top and the disabled state on everything below it — offering
 * an upload that can't be matched to anything would be a form that accepts
 * work and then wastes it.
 *
 * Unlike the six form steps, this one doesn't go through `save-step`: uploads
 * have their own multipart endpoint, and what's already on file comes back
 * from it rather than from `draft_payload`.
 */
export function NexxtapDocumentsScreen() {
  const router = useRouter();
  const state = useAtomValue(nexxtapOnboardingAtom);
  const [documents, setDocuments] = useAtom(nexxtapDocumentsAtom);

  /** Local picks not yet sent — what Save actually uploads. */
  const [pending, setPending] = React.useState<
    Partial<Record<NexxtapDocumentSlotId, File>>
  >({});
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);

  const ready = bankDone(state);
  const trust = hasTrust(state.activity);
  const required = requiredDocumentSlots(trust);

  /*
   * Every slot is shown, not just the required ones — the three optional
   * ones speed up approval, and a merchant who has a BAS to hand should be
   * able to add it. Trust deeds are the exception: they only appear when the
   * Activity step says there's a trust, because otherwise NextTap won't take
   * them.
   */
  const slots = NEXXTAP_DOCUMENT_SLOTS.filter(
    (slot) => slot.required !== "trust" || trust,
  );

  /** What the service already holds, newest first, one per slot. */
  const held = React.useMemo(() => {
    const map = new Map<string, (typeof documents)[number]>();
    for (const document of documents) {
      if (!map.has(document.document_type)) map.set(document.document_type, document);
    }
    return map;
  }, [documents]);

  const missing = required.filter(
    (slot) => !held.has(slot) && !pending[slot],
  );

  /** Per slot, why the last file picked for it was turned away. */
  const [fileErrors, setFileErrors] = React.useState<
    Partial<Record<NexxtapDocumentSlotId, string>>
  >({});

  const setFileError = (slot: NexxtapDocumentSlotId, message: string | null) =>
    setFileErrors((current) => {
      const next = { ...current };
      if (message) next[slot] = message;
      else delete next[slot];
      return next;
    });

  // Checked the moment it's picked — type, size and that the content really is
  // what the name says — so a bad file is caught here, not at submit.
  const attach = async (slot: NexxtapDocumentSlotId, file: File) => {
    const issue = await nexxtapFileIssue(file);
    setFileError(slot, issue);
    if (issue) return;
    setPending((current) => ({ ...current, [slot]: file }));
  };

  const clear = (slot: NexxtapDocumentSlotId) => {
    setFileError(slot, null);
    setPending((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
  };

  const removeUploaded = async (documentId: string) => {
    setRemoving(documentId);
    try {
      await deleteNexxtapDocument(documentId);
      setDocuments(await fetchNexxtapDocuments());
      toast.success("Document removed");
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't remove that document"),
      );
    } finally {
      setRemoving(null);
    }
  };

  const save = async () => {
    if (missing.length > 0) {
      toast.error(
        `${missing.length} ${missing.length === 1 ? "document is" : "documents are"} still needed`,
      );
      return;
    }

    if (Object.keys(pending).length === 0) {
      router.push(NEXXTAP_OVERVIEW_HREF);
      return;
    }

    setSaving(true);
    try {
      const uploaded = await uploadNexxtapDocuments(pending, trust);
      // The upload response carries the full list, but it's re-fetched when
      // it doesn't — the service returns the row it just wrote in some paths
      // and the whole set in others.
      setDocuments(uploaded.length > 0 ? uploaded : await fetchNexxtapDocuments());
      setPending({});
      toast.success("Documents uploaded");
      router.push(NEXXTAP_OVERVIEW_HREF);
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't upload your documents"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <NexxtapOnboardingShell stepId="documents">
      <div className="space-y-4">
        {/*
          The dependency, said before the thing it blocks.

          Amber rather than red: nothing has gone wrong, there's just a step
          to do first — and it links there rather than only naming it.
        */}
        {!ready && (
          <div className="flex items-start gap-3 rounded-[14px] border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 space-y-2">
              <p className="text-sm leading-relaxed">
                Save your settlement account in the Bank step to enable
                document upload — NextTap checks the bank statement against it.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-[9px] border-amber-300 bg-transparent text-amber-900 hover:bg-amber-100 dark:border-amber-400/40 dark:text-amber-100 dark:hover:bg-amber-500/20"
                asChild
              >
                <Link href={BANK_HREF}>Go to bank</Link>
              </Button>
            </div>
          </div>
        )}

        <FormSection
          icon={FileText}
          title="Supporting documents"
          description="The paperwork NextTap verifies the application against."
          headerClassName={NEXXTAP_SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <div className="space-y-2 rounded-[9px] border border-border bg-muted/40 p-3">
            <Requirement>
              The <strong>bank statement</strong> is mandatory. It has to show
              the account name, BSB and account number, and the account name
              has to match the authorised applicant.
            </Requirement>
            {trust && (
              <Requirement>
                <strong>Trust deeds</strong> are required because the business
                is held in a trust.
              </Requirement>
            )}
            <Requirement>
              Merchant statements, BAS statements and tax returns are optional,
              but they tend to speed up approval.
            </Requirement>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {slots.map((slot) => {
              const existing = held.get(slot.id) ?? null;
              const picked = pending[slot.id];
              return (
                <DocumentDropZone
                  key={slot.id}
                  title={slot.label}
                  hint={slot.hint}
                  optional={slot.required === "never"}
                  file={picked ? { name: picked.name } : null}
                  existing={
                    existing
                      ? {
                          id: existing.id,
                          name: existing.original_filename,
                          uploadedAt: existing.uploaded_at,
                        }
                      : null
                  }
                  disabled={!ready || saving || removing === existing?.id}
                  accept={NEXXTAP_ACCEPT_ATTR}
                  acceptLabel="PDF, JPG, PNG, DOC or XLS · max 20 MB"
                  error={fileErrors[slot.id]}
                  onSelect={(file) => void attach(slot.id, file)}
                  onClear={() => clear(slot.id)}
                  onDeleteExisting={removeUploaded}
                />
              );
            })}
          </div>
        </FormSection>
      </div>

      <NexxtapStepFooter
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
    </NexxtapOnboardingShell>
  );
}

function Requirement({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
