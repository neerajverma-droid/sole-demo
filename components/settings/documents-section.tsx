"use client";

import * as React from "react";
import Link from "next/link";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { SectionCard } from "@/components/settings/section-card";
import { useSectionDraft } from "@/components/settings/use-section-draft";
import { documentsDraftAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import {
  SALES_PAYMENT_TERMS,
  TERM_DAYS,
  type DocumentsSectionForm,
} from "@/lib/settings";
import { useDocumentDefaults } from "@/hooks/use-business-settings";
import { useActiveBusiness } from "@/hooks/use-active-business";

/** Matches the Branding tab's own ceiling — the file is uploaded, not inlined. */
const MAX_LOGO_BYTES = 512 * 1024;

/**
 * Invoice & quote defaults.
 *
 * The notes and the logo are real: they're `invoice_note`, `quote_note` and
 * the account's profile picture on the one `save-branding` record that Sales
 * settings also edits, reached through `useDocumentDefaults`. Editing them
 * from two screens is safe because that hook always posts the whole record —
 * see its note.
 *
 * Payment terms and quote expiry are applied when a document is created and
 * have no column in sole-ocr, so they stay device-local and are labelled that
 * way rather than sharing a Save button that implies otherwise.
 */
export function DocumentsSection() {
  const { values: stored, ready, save } = useDocumentDefaults();
  const { business } = useActiveBusiness();
  const { values, dirty, patch, reset } = useSectionDraft(
    stored,
    documentsDraftAtom,
    business?.id ?? null,
  );
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [saving, setSaving] = React.useState(false);

  const onLogo = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("That logo is too large", {
        description: "Use an image under 512 KB.",
      });
      return;
    }
    const reader = new FileReader();
    // Read as a data URL so the preview is immediate; the upload happens on
    // Save, which is what turns it into a served URL.
    reader.onload = () => patch({ logo: String(reader.result) });
    reader.onerror = () => toast.error("That image could not be read");
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await save(values);
      reset();
      toast.success("Invoice & quote defaults saved");
    } catch (error) {
      // Draft kept — the notes and logo now go over the wire and can fail.
      toast.error(apiErrorMessage(error, "Couldn't save your changes."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Invoice & quote defaults"
      description="Applied to every new invoice and quote — you can still override them per document."
      dirty={dirty && ready}
      saving={saving}
      onSave={() => void onSave()}
    >
      <div className="grid gap-[15px] sm:grid-cols-2">
        <Field
          label="Payment terms"
          hint="Days until an invoice is due. Saved on this device."
        >
          <Select
            value={values.paymentTermsDays}
            onValueChange={(value) =>
              patch({
                paymentTermsDays:
                  value as DocumentsSectionForm["paymentTermsDays"],
              })
            }
          >
            <SelectTrigger aria-label="Payment terms">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SALES_PAYMENT_TERMS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Quote expiry"
          hint="Days a quote stays open. Saved on this device."
        >
          <Select
            value={values.quoteExpiryDays}
            onValueChange={(value) =>
              patch({
                quoteExpiryDays:
                  value as DocumentsSectionForm["quoteExpiryDays"],
              })
            }
          >
            <SelectTrigger aria-label="Quote expiry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERM_DAYS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Numbering moved to Sales settings, which owns everything that goes out. */}
      <p className="text-sm text-muted-foreground">
        Invoice and quote numbering lives in{" "}
        <Link
          href="/sales/settings"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sales settings
        </Link>
        .
      </p>

      <Field
        label="Default invoice note / terms"
        hint="Appears at the foot of every invoice."
      >
        <Textarea
          rows={3}
          value={values.invoiceNotes}
          disabled={!ready}
          onChange={(event) => patch({ invoiceNotes: event.target.value })}
        />
      </Field>

      <Field
        label="Default quote terms"
        hint="Appears at the foot of every quote."
      >
        <Textarea
          rows={3}
          value={values.quoteNotes}
          disabled={!ready}
          onChange={(event) => patch({ quoteNotes: event.target.value })}
        />
      </Field>

      <Field label="Logo" hint="PNG or JPG under 512 KB.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted/40">
            {values.logo ? (
              // Either a data URL the user just picked or a URL the API
              // serves; next/image adds nothing to either.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.logo}
                alt="Business logo preview"
                className="size-full object-contain"
              />
            ) : (
              <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={!ready}
            onClick={() => fileRef.current?.click()}
          >
            {values.logo ? "Replace logo" : "Upload logo"}
          </Button>

          {values.logo && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => patch({ logo: null })}
            >
              <X />
              Remove
            </Button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onLogo(file);
              event.target.value = "";
            }}
          />
        </div>
      </Field>
    </SectionCard>
  );
}
