"use client";

import * as React from "react";
import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useCountryContext } from "@/hooks/use-country-context";
import { formatBusinessAddress } from "@/lib/businesses";
import { businessIdentifiers } from "@/lib/country-context";
import type { DocumentFields } from "@/lib/sales-settings";

/**
 * Who the document is from.
 *
 * The name, address and business numbers (ABN; NZBN and GST number; …) are
 * read from the open business's profile and are never editable here: they're
 * properties of the business, not of this
 * document, so changing them on one invoice would put a different address on
 * the form than the rendered PDF prints. Business details is where they change.
 *
 * The email is the exception, and the only thing Edit touches. It's the
 * address the invoice is sent from and copied to, it defaults to the saved
 * one, and it genuinely can differ per document — which is why it lives on the
 * draft rather than on the business.
 */
export function SenderBlock({
  /** Which of the "your …" lines Sales settings prints. */
  fields,
  email,
  onEmailChange,
}: {
  fields?: Pick<
    DocumentFields,
    "yourBusinessName" | "yourBusinessAddress" | "yourBusinessAbn"
  >;
  /**
   * The reply-to address for this document. Omitted by a caller that has no
   * per-document email — the row and the Edit action are then not shown.
   */
  email?: string;
  onEmailChange?: (value: string) => void;
} = {}) {
  const { business, loading } = useActiveBusiness();
  const { country } = useCountryContext();
  // Labelled by the business's country, exactly as the rendered PDF prints them.
  const identifiers = businessIdentifiers(country, business);

  const show = {
    name: fields?.yourBusinessName ?? true,
    address: fields?.yourBusinessAddress ?? true,
    abn: fields?.yourBusinessAbn ?? false,
  };

  const address = formatBusinessAddress(business);
  const editable = email !== undefined && !!onEmailChange;

  const [editing, setEditing] = React.useState(false);
  // Held apart from the committed value so Cancel has something to discard.
  const [emailDraft, setEmailDraft] = React.useState(email ?? "");

  return (
    <FormSection
      icon={Building2}
      title="From"
      className="space-y-3"
      action={
        editable ? (
          editing ? (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => {
                  onEmailChange?.(emailDraft.trim());
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-muted-foreground"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                // Seeded on open, so it always starts from what's shown.
                setEmailDraft(email ?? "");
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" aria-hidden />
          <Skeleton className="h-4 w-56" aria-hidden />
        </div>
      ) : (
        <>
          {show.name && business?.name && (
            <p className="text-sm font-medium">{business.name}</p>
          )}

          <div className="space-y-0.5 text-sm text-muted-foreground">
            {/* Switched off in Sales settings means it isn't printed. */}
            {show.address && address && <p>{address}</p>}

            {editable ? (
              editing ? (
                <Input
                  type="email"
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                  placeholder="you@yourbusiness.com"
                  aria-label="Invoice email"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onEmailChange?.(emailDraft.trim());
                      setEditing(false);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditing(false);
                    }
                  }}
                />
              ) : (
                <p>{email || "No email set"}</p>
              )
            ) : null}

            {show.abn &&
              identifiers.map((identifier) => (
                <p key={identifier.key} className="tabular">
                  {identifier.label} {identifier.value}
                </p>
              ))}
          </div>
        </>
      )}
    </FormSection>
  );
}
