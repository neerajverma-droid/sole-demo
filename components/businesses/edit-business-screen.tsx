"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ui/shimmer";
import { PageHeader } from "@/components/layout/page-header";
import { useAddressRules } from "@/hooks/use-address-rules";
import {
  BusinessProfileForm,
  EMPTY_BUSINESS_DRAFT,
  businessDraftIssues,
  draftFromDetail,
  type BusinessProfileDraft,
} from "@/components/businesses/business-profile-form";
import {
  fetchBusinessDetail,
  logoDocumentId as resolveLogoDocumentId,
  logoFileName as resolveLogoFileName,
  updateBusinessApi,
} from "@/lib/businesses";
import { deleteSourceDocument, uploadSourceDocument } from "@/lib/file-upload";
import { apiErrorMessage } from "@/lib/api-error";
import { useIndustriesQuery } from "@/hooks/use-industries-query";

/**
 * Editing a business.
 *
 * The same form the add-business flow uses, on its own page rather than a
 * drawer — `/businesses/[id]` is what the card's "Edit details" link has
 * always pointed at. No payment step here: unlike creating one, changing an
 * existing business's details never touches its subscription.
 */
export function EditBusinessScreen({ businessId }: { businessId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const industriesQuery = useIndustriesQuery();
  const industries = industriesQuery.data;

  const query = useQuery({
    queryKey: ["business", businessId],
    queryFn: () => fetchBusinessDetail(businessId),
  });

  const [draft, setDraft] = React.useState<BusinessProfileDraft>(EMPTY_BUSINESS_DRAFT);
  const [showIssues, setShowIssues] = React.useState(false);
  const [logo, setLogo] = React.useState<
    { name: string; size?: number; url?: string } | null
  >(null);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  /**
   * Object URLs made from a freshly picked file — tracked so the previous one
   * gets revoked rather than leaked the moment it's replaced or removed. The
   * existing saved logo's own URL is never put here: it's the server's, not
   * one this page created, so there's nothing of ours to revoke for it.
   */
  const objectUrlRef = React.useRef<string | null>(null);
  const revokePendingPreview = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };
  React.useEffect(() => revokePendingPreview, []);
  /** The saved logo's URL, so a save that touches nothing else leaves it alone. */
  const [existingLogoUrl, setExistingLogoUrl] = React.useState<string | null>(
    null,
  );
  /** True once the saved logo has been explicitly cleared, not just left untouched. */
  const [logoRemoved, setLogoRemoved] = React.useState(false);
  /**
   * The logo's document id — either the saved one the detail response
   * carries (`documents[]`, matched by file path), or a freshly uploaded
   * one once `onLogo` fires. Either way, this is what makes Remove call
   * `deleteSourceDocument` for real: sole-webapp's edit mode uploads to the
   * generic documents endpoint the moment a file is picked and deletes that
   * same document immediately on removal
   * (components/Common/UploadMulipleShadcn.js) — live, not deferred to Save
   * — and that applies to the logo already on the business exactly as much
   * as to one picked this session, since the detail fetch hands back its id
   * too.
   */
  const [logoDocumentId, setLogoDocumentId] = React.useState<string | null>(
    null,
  );
  const [saving, setSaving] = React.useState(false);
  // The fetch resolves once; further edits shouldn't be clobbered by a
  // background refetch of the same query key.
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    // Both queries, not just the business — resolving industry_id to a name
    // needs the industries list too, and hydrating without it would leave
    // the picker blank until a second pass caught up.
    if (query.data && industries && !hydrated.current) {
      setDraft(draftFromDetail(query.data, industries));
      // Its byte size was never downloaded, only its name and URL — size is
      // left unset rather than faked as 0, the same as sole-webapp's own edit
      // drawer seeds its file list from `business.logo`
      // (components/BusinessProfile/BusinessProfileFormSheet.jsx).
      if (query.data.logo) {
        setExistingLogoUrl(query.data.logo);
        setLogo({
          name: resolveLogoFileName(query.data) ?? "Current logo",
          url: query.data.logo,
        });
        setLogoDocumentId(resolveLogoDocumentId(query.data));
      }
      hydrated.current = true;
    }
  }, [query.data, industries]);

  const addressRules = useAddressRules();
  const issues = businessDraftIssues(draft, undefined, addressRules.postcodeError);
  const patch = (partial: Partial<BusinessProfileDraft>) =>
    setDraft((current) => ({ ...current, ...partial }));

  const cancel = () => {
    if (window.history.length > 1) router.back();
    else router.push("/businesses");
  };

  const save = async () => {
    setShowIssues(true);
    if (Object.keys(issues).length > 0 || saving) {
      toast.error("Some details are missing", {
        description: "The marked fields are needed before saving.",
      });
      return;
    }

    setSaving(true);
    try {
      const industryId = industries?.find((entry) => entry.name === draft.industry);
      await updateBusinessApi(
        businessId,
        draft,
        industryId ? Number(industryId.id) : null,
        {
          file: logoFile,
          // Only a real removal when nothing new replaced it — picking a new
          // file after clicking Remove supersedes the removal, not adds to it.
          remove: logoRemoved && !logoFile,
        },
      );
      // The list page reads from its own cached copy — this is what makes it
      // show the new name/ABN/etc. without a manual refresh.
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      toast.success(`${draft.businessName} updated`);
      router.push("/businesses");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't save those changes. Try again."));
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading || industriesQuery.isLoading) {
    return (
      <div className="space-y-[15px]" aria-hidden>
        <Shimmer className="h-8 w-72 rounded-md" />
        <Shimmer className="h-96 w-full rounded-lg border border-border" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load that business. It may have been removed.
        </p>
        <Button variant="outline" onClick={() => router.push("/businesses")}>
          <ArrowLeft />
          Back to businesses
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Building2}
        title="Edit business profile"
        description="Business email, ABN, business name, and industry are required."
      />

      <BusinessProfileForm
        draft={draft}
        patch={patch}
        issues={issues}
        showIssues={showIssues}
        logo={logo}
        onLogo={async (file) => {
          revokePendingPreview();
          const previewUrl = URL.createObjectURL(file);
          objectUrlRef.current = previewUrl;
          setLogo({ name: file.name, size: file.size, url: previewUrl });
          setLogoFile(file);
          setLogoRemoved(false);
          try {
            const documentId = await uploadSourceDocument(
              "business",
              businessId,
              file,
            );
            setLogoDocumentId(documentId);
          } catch (error) {
            toast.error(apiErrorMessage(error, "Couldn't upload that image. Try again."));
          }
        }}
        onRemoveLogo={async () => {
          revokePendingPreview();
          setLogo(null);
          setLogoFile(null);
          if (existingLogoUrl) setLogoRemoved(true);
          if (logoDocumentId) {
            const documentId = logoDocumentId;
            setLogoDocumentId(null);
            try {
              await deleteSourceDocument(documentId);
            } catch (error) {
              toast.error(apiErrorMessage(error, "Couldn't remove that upload. Try again."));
            }
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5">
        <Button variant="outline" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
