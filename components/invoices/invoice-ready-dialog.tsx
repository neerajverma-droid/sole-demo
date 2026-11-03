"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { Check, ImagePlus, Landmark, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AddAddressDialog } from "@/components/invoices/add-address-dialog";
import { AddBankDetailsDialog } from "@/components/invoices/add-bank-details-dialog";
import { draftFromDetail } from "@/components/businesses/business-profile-form";
import { useIndustriesQuery } from "@/hooks/use-industries-query";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useCountryContext } from "@/hooks/use-country-context";
import { apiErrorMessage } from "@/lib/api-error";
import {
  fetchBusinessDetail,
  hasBankDetails,
  hasBusinessAddress,
  updateBusinessApi,
} from "@/lib/businesses";
import { connectBankIntroOpenAtom } from "@/lib/atoms";
import { cn } from "@/lib/utils";

/*
 * TODO(mascot): once `components/onboarding/mascot/mascot-guide.tsx` lands
 * (a parallel piece of work landing separately), swap the plain paragraph
 * below for `<MascotGuide line={line} />` — the `line` copy here is already
 * written in Pip's voice and drops straight in. Left as text for now rather
 * than blocking this gate on that component existing.
 */

const LOGO_SKIP_KEY = "sole.invoice.skipBusinessLogo";

function readLogoSkip(): boolean {
  try {
    return window.localStorage.getItem(LOGO_SKIP_KEY) === "true";
  } catch {
    // Private mode, or storage blocked outright — the flag just won't stick
    // between visits, which is a worse nag, not a broken one.
    return false;
  }
}

function Row({
  icon: Icon,
  title,
  subtitle,
  done,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3.5 transition-colors",
        done ? "border-success/20 bg-success/[0.04]" : "border-border bg-card",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl",
          done
            ? "bg-success text-success-foreground"
            : "bg-primary/10 text-primary",
        )}
        aria-hidden
      >
        {done ? <Check className="size-4" /> : <Icon className="size-4" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">
          {done ? "Sorted." : subtitle}
        </span>
      </span>

      {!done && children}
    </div>
  );
}

/**
 * The three things an invoice can't go out without, asked for once, up front.
 *
 * Ported from sole-webapp's `InvoiceReadyPopup`: an invoice with no business
 * address isn't a valid tax invoice, and one with no bank details can't be
 * paid, so both are asked for here rather than left as optional-looking
 * fields buried in the invoice form itself.
 *
 * Address and bank details are required to get past it — the logo is not,
 * and can be skipped, with the skip remembered in `localStorage` under
 * `sole.invoice.skipBusinessLogo` so it doesn't nag twice.
 *
 * Cheap to mount unconditionally: it reads the same `useActiveBusiness`
 * business-profile data every other invoice screen already reads, and
 * renders `null` the moment nothing is missing. Each row hands off to the
 * dialog that already owns that job (`AddAddressDialog`, the existing
 * `AddBankDetailsDialog`) — both save through `updateBusinessApi` and
 * invalidate the same `["businesses"]` / `["business", id]` queries this
 * component reads, so a row flips to done with nothing wired up between them.
 */
export function InvoiceReadyDialog() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    business,
    ready: businessReady,
    error: businessError,
  } = useActiveBusiness();
  // Which bank fields make a business payable is its country's call — a New
  // Zealand account number has no separate BSB.
  const { country, ready: countryReady, isError: countryError } = useCountryContext();
  const industriesQuery = useIndustriesQuery();
  const openConnectBank = useSetAtom(connectBankIntroOpenAtom);

  const [addressOpen, setAddressOpen] = React.useState(false);
  const [bankOpen, setBankOpen] = React.useState(false);
  const [logoSkipped, setLogoSkipped] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  /** Set once the user has everything and says they're ready. */
  const [done, setDone] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setLogoSkipped(readLogoSkip());
  }, []);

  // Only asserted once the profile has actually loaded, and never on a
  // failed lookup — same rule the invoice editor's own `missingBankDetails`
  // applies, so a lookup failure never becomes the thing that blocks
  // invoicing outright.
  // The country is waited for too: judged against the Australian fallback, a
  // New Zealand business would flash up as missing a BSB it can't have. A
  // failed lookup doesn't hold the gate shut forever — it judges by fallback.
  const loaded =
    businessReady && !businessError && !!business && (countryReady || countryError);

  const needsAddress = loaded && !hasBusinessAddress(business);
  const needsBank = loaded && !hasBankDetails(business, country);
  const needsLogo = loaded && !business.logo && !logoSkipped;

  const isReady = !needsAddress && !needsBank;
  /*
   * The two required rows stay on screen once the popup is up, so filling
   * one ticks it rather than vanishing it. The logo row is optional, so once
   * it's uploaded or skipped it simply goes.
   */
  const visible = loaded && !done && (needsAddress || needsBank || needsLogo);
  const title = needsLogo ? "Three quick things" : "Two quick things";

  const line = React.useMemo(() => {
    if (isReady && !needsLogo) {
      return "That's the lot — you're set. Let's write that invoice.";
    }
    if (isReady) {
      return "Just the logo left, and that one's optional. Ready when you are.";
    }
    const outstanding = [needsAddress && "address", needsBank && "bank details"]
      .filter(Boolean)
      .join(" and ");
    return `Hi, Pip here! Before you write an invoice I need your ${outstanding} — an invoice isn't valid without the address, and nobody can pay you without the bank details. Takes a minute, then I'll never ask again.`;
  }, [needsAddress, needsBank, needsLogo, isReady]);

  /*
   * Logo upload. There's no separate "upload a business logo" flow to reuse
   * here — the edit-business screen instead saves the whole record through
   * `updateBusinessApi`'s own `logo` param, seeded from the real detail so
   * nothing else on it gets clobbered — so this does the same, fetching that
   * detail (plus the industries list `draftFromDetail` needs) lazily, only
   * once a logo action is actually on screen.
   */
  const detailQuery = useQuery({
    queryKey: ["business", business?.id],
    queryFn: () => fetchBusinessDetail(business!.id),
    enabled: needsLogo && !!business,
  });

  const uploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !business) return;
    if (!detailQuery.data || !industriesQuery.data) {
      toast.error(
        "Still loading your business details — try again in a moment.",
      );
      return;
    }

    setUploading(true);
    try {
      const draft = draftFromDetail(detailQuery.data, industriesQuery.data);
      const industryId = industriesQuery.data.find(
        (entry) => entry.name === draft.industry,
      );
      await updateBusinessApi(
        business.id,
        draft,
        industryId ? Number(industryId.id) : null,
        { file },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["businesses"] }),
        queryClient.invalidateQueries({ queryKey: ["business", business.id] }),
      ]);
    } catch (error) {
      toast.error(apiErrorMessage(error, "We couldn't upload that image"));
    } finally {
      setUploading(false);
    }
  };

  const skipLogo = () => {
    try {
      window.localStorage.setItem(LOGO_SKIP_KEY, "true");
    } catch {
      /* private mode — the flag below still holds for this screen */
    }
    setLogoSkipped(true);
  };

  if (!visible) return null;

  return (
    <>
      <DialogPrimitive.Root open>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-pop" />

          <DialogPrimitive.Content
            // No way out but through: closing this would drop the user into
            // a form that can't produce a valid invoice. Same three
            // preventions `FirstRunOverlay` uses for the same reason.
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            aria-describedby={undefined}
            data-usertour="invoice-ready-dialog"
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl data-[state=open]:animate-pop"
          >
            <DialogPrimitive.Title className="sr-only">
              What your invoice still needs
            </DialogPrimitive.Title>

            <div className="relative overflow-hidden bg-gradient-to-br from-primary to-violet-500 px-6 pb-12 pt-5">
              <p className="relative m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/80">
                Before your first invoice
              </p>
              <h2 className="relative m-0 mt-1 text-xl font-semibold tracking-tight text-primary-foreground">
                {title}
              </h2>
            </div>

            <div className="px-6 pb-6 pt-4">
              {/* Plain text for now — see the mascot TODO at the top of this file. */}
              <p aria-live="polite" className="m-0 text-sm text-muted-foreground">
                {line}
              </p>

              <div className="mt-4 space-y-2">
                <Row
                  icon={MapPin}
                  title="Your business address"
                  subtitle="A tax invoice has to carry it."
                  done={!needsAddress}
                >
                  <Button size="sm" onClick={() => setAddressOpen(true)}>
                    Add address
                  </Button>
                </Row>

                <Row
                  icon={Landmark}
                  title="How you get paid"
                  subtitle="Bank details on the invoice, or connect your bank."
                  done={!needsBank}
                >
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openConnectBank(true)}
                    >
                      Connect bank
                    </Button>
                    <Button size="sm" onClick={() => setBankOpen(true)}>
                      Add details
                    </Button>
                  </div>
                </Row>

                {needsLogo && (
                  <Row
                    icon={ImagePlus}
                    title="Your logo"
                    subtitle="Optional — it just makes the invoice look like yours."
                    done={false}
                  >
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={skipLogo}
                        className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Skip
                      </button>
                      <Button
                        size="sm"
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                      >
                        {uploading ? (
                          <span className="flex items-center gap-1.5">
                            <Loader2 className="size-3.5 animate-spin" />
                            Uploading
                          </span>
                        ) : (
                          "Upload"
                        )}
                      </Button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        hidden
                        aria-label="Upload your logo"
                        onChange={uploadLogo}
                      />
                    </div>
                  </Row>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/invoices")}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Back to invoices
                </button>

                <Button disabled={!isReady} onClick={() => setDone(true)}>
                  {isReady ? "Start my invoice" : "Fill these in to start"}
                </Button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* The dialogs that already own these two jobs — saving through
          `updateBusinessApi` and the shared query keys is what flips the
          rows above, with nothing to wire up between them. */}
      {business && (
        <>
          <AddAddressDialog
            open={addressOpen}
            onOpenChange={setAddressOpen}
            businessId={business.id}
          />
          <AddBankDetailsDialog
            open={bankOpen}
            onOpenChange={setBankOpen}
            businessId={business.id}
          />
        </>
      )}
    </>
  );
}
