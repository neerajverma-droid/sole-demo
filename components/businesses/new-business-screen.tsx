"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, CircleCheck, Clock, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shimmer } from "@/components/ui/shimmer";
import { WizardStepper } from "@/components/bulk/wizard-parts";
import {
  PricingPlans,
  type PricingSelection,
} from "@/components/pricing/pricing-plans";
import { PageHeader } from "@/components/layout/page-header";
import {
  BusinessProfileForm,
  EMPTY_BUSINESS_DRAFT,
  businessDraftIssues,
  countryRegistrationField,
  draftFromDetail,
  newBusinessCountry,
  type BusinessProfileDraft,
} from "@/components/businesses/business-profile-form";
import {
  createBusinessApi,
  fetchBusinessDetail,
  fetchBusinesses,
  logoFileName as resolveLogoFileName,
} from "@/lib/businesses";
import { apiErrorMessage } from "@/lib/api-error";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { createCheckoutSession } from "@/lib/subscription";
import { useBusinessesStore } from "@/stores/businesses";
import { useBusinessesQuery } from "@/hooks/use-businesses-query";
import { useCheckoutReturn } from "@/hooks/use-checkout-return";
import { useCountriesQuery } from "@/hooks/use-countries-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { useIndustriesQuery } from "@/hooks/use-industries-query";

const STEPS = ["Business details", "Payment"] as const;

/**
 * Half price, which is the offer the banner at the top of the page states.
 *
 * A constant shared by the banner's copy and the picker's arithmetic, so the
 * promise and the figures can't drift — a page that says 50% off and charges
 * something else is worse than one that says nothing.
 */
const ADDITIONAL_BUSINESS_DISCOUNT = 0.5;

/**
 * Adding a business — or reviewing one on its way to being paid for.
 *
 * A page rather than a dialog, on the standard app shell — the form runs to
 * twenty fields across six sections, which is more than a modal can hold
 * without becoming a scroller inside a scroller. The switcher's Add business
 * links straight here.
 *
 * Two steps, and the second one can be arrived at directly: a business whose
 * payment never completed is locked in the switcher, and its Complete payment
 * link lands on this page with `?business=<id>&step=payment`. That business
 * already exists, so this fetches and shows its real saved details the same
 * way the edit screen does — but read-only, since this step is "review, then
 * pay," not "edit." Cancel and Continue to Payment behave exactly as they do
 * for a brand new business either way; only whether Continue creates one
 * first differs.
 */
export function NewBusinessScreen() {
  const router = useRouter();
  const rawParams = useSearchParams();
  const params = React.useMemo(
    () => new URLSearchParams(rawParams?.toString() ?? ""),
    [rawParams],
  );
  const queryClient = useQueryClient();
  // A direct link to this page (the switcher's "Add business", a locked
  // business's "Complete payment") is the common way in — nothing else on
  // this route guarantees the shared list has been fetched yet.
  useBusinessesQuery();
  const industriesQuery = useIndustriesQuery();
  const industries = industriesQuery.data;
  const businesses = useBusinessesStore((state) => state.businesses);
  const setBusinesses = useBusinessesStore((state) => state.setBusinesses);
  const selectBusiness = useBusinessesStore((state) => state.select);

  /** The business being paid for, if we arrived here to finish paying for one. */
  const resumeId = params.get("business");
  const isResuming = params.get("step") === "payment" && !!resumeId;

  const detailQuery = useQuery({
    queryKey: ["business", resumeId],
    queryFn: () => fetchBusinessDetail(resumeId as string),
    enabled: isResuming,
  });

  const [step, setStep] = React.useState(0);
  const [draft, setDraft] =
    React.useState<BusinessProfileDraft>(EMPTY_BUSINESS_DRAFT);
  const [showIssues, setShowIssues] = React.useState(false);
  const [logo, setLogo] = React.useState<
    { name: string; size?: number; url?: string } | null
  >(null);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  /**
   * Object URLs made from a freshly picked file — tracked so the previous one
   * gets revoked rather than leaked once it's replaced or removed. The
   * resumed business's own logo URL is never put here: it's the server's,
   * not one this page created.
   */
  const objectUrlRef = React.useRef<string | null>(null);
  const revokePendingPreview = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };
  React.useEffect(() => revokePendingPreview, []);
  const [saving, setSaving] = React.useState(false);
  /** The business step 1 created (or is resuming), so step 2 knows what it's paying for. */
  const [createdId, setCreatedId] = React.useState<string | null>(resumeId);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (isResuming && detailQuery.data && industries && !hydrated.current) {
      setDraft(draftFromDetail(detailQuery.data, industries));
      if (detailQuery.data.logo) {
        setLogo({
          name: resolveLogoFileName(detailQuery.data) ?? "Current logo",
          url: detailQuery.data.logo,
        });
      }
      hydrated.current = true;
    }
  }, [isResuming, detailQuery.data, industries]);

  /*
   * The country the new business is created in. Defaults to the active
   * business's — a user's businesses share one country, which the server
   * enforces — and the business number and dial code follow whichever is
   * chosen. Null until someone picks, so the default tracks the active
   * business's country context as it loads rather than freezing the
   * bundled AU fallback. Resuming shows the saved business's own country.
   */
  const { country: activeCountry } = useCountryContext();
  const { data: countries = [] } = useCountriesQuery();
  const [chosenIso2, setChosenIso2] = React.useState<string | null>(null);
  const countryIso2 = (
    (isResuming ? detailQuery.data?.country_iso2 : chosenIso2) ||
    activeCountry.iso2
  ).toUpperCase();
  const newCountry = newBusinessCountry(countries, countryIso2, activeCountry);

  const issues = businessDraftIssues(
    draft,
    countryRegistrationField(newCountry?.identifierSchema),
  );
  const patch = (partial: Partial<BusinessProfileDraft>) =>
    setDraft((current) => ({ ...current, ...partial }));

  /**
   * Back to wherever they came from.
   *
   * `router.back()` when there's history to go back to, and the dashboard when
   * there isn't — someone who opened this page directly has no "came from", and
   * a Cancel that does nothing is worse than one that goes somewhere sensible.
   */
  const cancel = () => {
    if (window.history.length > 1) router.back();
    else router.push("/dashboard");
  };

  const continueToPayment = async () => {
    // Resuming: the business already exists — this step is read-only review,
    // so Continue just moves on rather than validating or creating anything.
    if (isResuming) {
      setStep(1);
      return;
    }

    setShowIssues(true);
    if (Object.keys(issues).length > 0 || saving) {
      toast.error("Some details are missing", {
        description: "The marked fields are needed before payment.",
      });
      return;
    }

    setSaving(true);
    try {
      const industryId = industries?.find((entry) => entry.name === draft.industry);
      const created = await createBusinessApi(
        // The address country is the business's own, so it follows the pick.
        newCountry ? { ...draft, country: newCountry.name } : draft,
        industryId ? Number(industryId.id) : null,
        { file: logoFile },
        { iso2: countryIso2, dialCode: newCountry?.phoneDialCode },
      );
      // The switcher and this page's own `businesses` (used to resolve
      // `createdId` below) both read the shared cache — refetch it now
      // rather than after the payment step, so `finishPayment` finds the
      // business it just made.
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      setCreatedId(String(created.id));
      setStep(1);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't create that business. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const [paying, setPaying] = React.useState(false);

  const businessName = (id: string | null) =>
    businesses.find((entry) => entry.id === id)?.name || draft.businessName || "Your business";

  /**
   * Hands over to Stripe Checkout for THIS business.
   *
   * `businessId` matters: the open business is still the old one while this
   * one is being added, and without it the checkout would be priced and
   * recorded against the wrong business. The return lands back on this page
   * at the payment step, where `useCheckoutReturn` below picks it up.
   */
  const startCheckout = async (selection: PricingSelection) => {
    if (!createdId || paying) return;
    setPaying(true);
    try {
      const url = await createCheckoutSession(
        {
          planSlug: selection.planSlug,
          billing: selection.billing,
          addons: selection.addons,
        },
        {
          businessId: createdId,
          returnPath: `/businesses/new?business=${encodeURIComponent(createdId)}&step=payment`,
        },
      );
      track(EVENTS.UPGRADE_INTENT, {
        plan: selection.planSlug,
        billing: selection.billing,
        amount: selection.monthlyTotal,
        context: "add_business",
      });
      window.location.href = url;
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't open checkout. Try again."));
      setPaying(false);
    }
  };

  /*
   * Back from Stripe. The business only unlocks once Stripe's webhook has
   * written its subscription, so the list is polled for this business's own
   * `paid` flag — the same one that decides whether it can be opened at all.
   */
  const latestList = React.useRef<Awaited<ReturnType<typeof fetchBusinesses>> | null>(null);
  const checkout = useCheckoutReturn(
    async () => {
      if (!resumeId) return false;
      const list = await queryClient.fetchQuery({
        queryKey: ["businesses"],
        queryFn: fetchBusinesses,
        staleTime: 0,
      });
      latestList.current = list;
      return list.businesses.some((entry) => entry.id === resumeId && entry.paid);
    },
    {
      onConfirmed: (result) => {
        const list = latestList.current;
        if (!list || !resumeId) return;
        // Straight into the store rather than waiting for the query's mirror
        // effect — `select` refuses a business it still believes is locked.
        setBusinesses(list.businesses, list.defaultId);
        selectBusiness(resumeId);
        const paidFor = list.businesses.find((entry) => entry.id === resumeId);
        track(EVENTS.PLAN_UPGRADED, {
          plan: result.planSlug ?? "",
          billing: result.billing ?? undefined,
          amount: paidFor?.subscription?.price ?? 0,
          via: "add_business",
        });
      },
    },
  );

  // A return lands on the payment step, not the review in front of it.
  React.useEffect(() => {
    if (checkout.phase !== "idle") setStep(1);
    if (checkout.phase === "cancelled") {
      toast("Checkout cancelled", {
        id: "checkout-cancelled",
        description: "You haven't been charged. Choose a plan whenever you're ready.",
      });
      checkout.dismiss();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.phase]);

  if (isResuming && (detailQuery.isLoading || industriesQuery.isLoading)) {
    return (
      <div className="space-y-[15px]" aria-hidden>
        <Shimmer className="h-8 w-72 rounded-md" />
        <Shimmer className="h-96 w-full rounded-lg border border-border" />
      </div>
    );
  }

  if (isResuming && detailQuery.isError) {
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
        title={isResuming ? "Review and activate" : "Add business profile"}
        description={
          isResuming
            ? "These are the details already saved for this business — choose a plan below to activate it."
            : `Business email, ${countryRegistrationField(newCountry?.identifierSchema).label}, business name, and industry are required.`
        }
      />

      {/*
        The discount, stated once and in the success tone because it's good
        news. `bg-success/10` with a `text-success` body rather than a saturated
        green fill — the same soft treatment every other status surface uses.
      */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-success/20 bg-success/10 px-4 py-3">
        <Sparkles className="size-4 shrink-0 text-success" aria-hidden />
        <p className="text-sm font-medium text-success">
          Additional businesses are{" "}
          {Math.round((1 - ADDITIONAL_BUSINESS_DISCOUNT) * 100)}% off — your
          most expensive business stays full price.
        </p>
      </div>

      <WizardStepper steps={STEPS} current={step} />

      {step === 0 ? (
        <>
          <BusinessProfileForm
            draft={draft}
            patch={patch}
            issues={issues}
            showIssues={showIssues}
            logo={logo}
            onLogo={(file) => {
              revokePendingPreview();
              const previewUrl = URL.createObjectURL(file);
              objectUrlRef.current = previewUrl;
              setLogo({ name: file.name, size: file.size, url: previewUrl });
              setLogoFile(file);
            }}
            onRemoveLogo={() => {
              revokePendingPreview();
              setLogo(null);
              setLogoFile(null);
            }}
            disabled={isResuming}
            // Only the required details for now; the other sections are
            // hidden until they're wanted back on this page.
            detailsOnly
            countryChoice={{
              value: countryIso2,
              countries,
              onChange: setChosenIso2,
            }}
          />

          {/* The action bar, at the foot of the form rather than pinned: the
              form is the page, and a floating bar over a page this long covers
              the last field someone is filling in. */}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5">
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
            <Button onClick={() => void continueToPayment()} disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {saving ? "Saving…" : "Continue to Payment"}
            </Button>
          </div>
        </>
      ) : (
        /*
         * The real plan picker, inline. `discount={0.5}` is the banner at the
         * top of this page made arithmetic — every figure on the panel shows
         * its full price struck through beside the half it's charging, so the
         * saving is visible rather than just asserted.
         */
        <PricingPlans
          discount={ADDITIONAL_BUSINESS_DISCOUNT}
          ctaLabel="Continue to payment"
          onSubmit={(selection) => void startCheckout(selection)}
          busy={paying}
          secondaryAction={
            <Button variant="outline" onClick={() => setStep(0)} disabled={paying}>
              <ArrowLeft />
              Back to details
            </Button>
          }
        />
      )}

      <ActivationDialog
        phase={checkout.phase}
        name={businessName(resumeId)}
        onOpen={() => router.push("/dashboard")}
        onLater={() => router.push("/businesses")}
      />
    </div>
  );
}

/**
 * The wait between paying and the business unlocking, then the way in.
 *
 * Not closable while confirming — closing it wouldn't stop the activation, and
 * would leave the page looking like nothing happened.
 */
function ActivationDialog({
  phase,
  name,
  onOpen,
  onLater,
}: {
  phase: ReturnType<typeof useCheckoutReturn>["phase"];
  name: string;
  onOpen: () => void;
  onLater: () => void;
}) {
  const confirming = phase === "confirming";
  const open = confirming || phase === "confirmed" || phase === "delayed";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !confirming && onLater()}>
      <DialogContent hideClose={confirming} className="max-w-sm text-center">
        {confirming ? (
          <Loader2 className="mx-auto size-10 animate-spin text-primary" aria-hidden />
        ) : phase === "confirmed" ? (
          <CircleCheck className="mx-auto size-10 text-success" aria-hidden />
        ) : (
          <Clock className="mx-auto size-10 text-muted-foreground" aria-hidden />
        )}

        <DialogHeader className="sm:text-center">
          <DialogTitle>
            {confirming
              ? `Activating ${name}…`
              : phase === "confirmed"
                ? `${name} is active`
                : "Payment received"}
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? "Payment went through. We're unlocking the business — this usually takes a few seconds."
              : phase === "confirmed"
                ? "It's open and ready to use."
                : "It's taking a little longer than usual to unlock. It'll open on its own within a few minutes — there's no need to pay again."}
          </DialogDescription>
        </DialogHeader>

        {!confirming && (
          <DialogFooter className="sm:justify-center">
            {phase === "confirmed" ? (
              <Button onClick={onOpen}>Open {name}</Button>
            ) : (
              <Button variant="outline" onClick={onLater}>
                Back to businesses
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
