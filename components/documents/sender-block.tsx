"use client";

import * as React from "react";
import { Building2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useCountryContext } from "@/hooks/use-country-context";
import { formatBusinessAddress } from "@/lib/businesses";
import { invoiceEmailError } from "@/lib/invoices";
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
  compact = false,
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
  /**
   * One line — business name and email — with Edit opening a dialog for the
   * email, instead of the address and business numbers with Edit inline.
   * Opt-in, so the quote editor keeps the fuller block.
   */
  compact?: boolean;
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
  const [emailError, setEmailError] = React.useState<string | undefined>();

  /** Commits the typed address, unless it isn't one — then it stays open with the reason. */
  const commitEmail = () => {
    const trimmed = emailDraft.trim();
    const error = invoiceEmailError(trimmed);
    if (error) {
      setEmailError(error);
      return;
    }
    setEmailError(undefined);
    onEmailChange?.(trimmed);
    setEditing(false);
  };

  if (compact) {
    return (
      <FormSection
        icon={Building2}
        title="From"
        action={
          editable ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                // Seeded on open, so it always starts from what's shown.
                setEmailDraft(email ?? "");
                setEmailError(undefined);
                setEditing(true);
              }}
            >
              <Pencil />
              Edit
            </Button>
          ) : undefined
        }
      >
        {loading ? (
          <Skeleton className="h-5 w-64" aria-hidden />
        ) : (
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
            {business?.name && (
              <span className="font-medium">{business.name}</span>
            )}
            {editable && (
              <span className="min-w-0 truncate text-muted-foreground">
                {email || "No email set"}
              </span>
            )}
          </p>
        )}

        <Dialog
          open={editing}
          onOpenChange={(open) => {
            if (!open) setEmailError(undefined);
            setEditing(open);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                commitEmail();
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>Business email</DialogTitle>
                <DialogDescription>
                  Invoices are sent from this address and copied to it. It only
                  changes this invoice.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                <Input
                  type="email"
                  value={emailDraft}
                  onChange={(event) => {
                    setEmailDraft(event.target.value);
                    setEmailError(undefined);
                  }}
                  placeholder="you@yourbusiness.com"
                  aria-label="Business email"
                  aria-invalid={!!emailError}
                  autoFocus
                />
                {emailError && (
                  <p role="alert" className="text-xs text-destructive">
                    {emailError}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </FormSection>
    );
  }

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
                onClick={commitEmail}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-muted-foreground"
                onClick={() => {
                  setEmailError(undefined);
                  setEditing(false);
                }}
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
                setEmailError(undefined);
                setEditing(true);
              }}
            >
              <Pencil />
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
                <div className="space-y-1">
                  <Input
                    type="email"
                    value={emailDraft}
                    onChange={(event) => {
                      setEmailDraft(event.target.value);
                      setEmailError(undefined);
                    }}
                    placeholder="you@yourbusiness.com"
                    aria-label="Invoice email"
                    aria-invalid={!!emailError}
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitEmail();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEmailError(undefined);
                        setEditing(false);
                      }
                    }}
                  />
                  {emailError && (
                    <p role="alert" className="text-xs text-destructive">
                      {emailError}
                    </p>
                  )}
                </div>
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
