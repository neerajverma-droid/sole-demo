"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtomValue } from "jotai";
import {
  ArrowRight,
  Building2,
  Check,
  Hash,
  Tag,
  type LucideIcon,
} from "lucide-react";

import { SuccessMark } from "@/components/onboarding/success-mark";
import { useCelebrationConfetti } from "@/components/onboarding/use-celebration-confetti";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { authNameAtom } from "@/lib/atoms";
import { titleCaseName } from "@/lib/onboarding";
import { UNSPECIFIED_INDUSTRY } from "@/lib/onboarding";
import { SCHEDULE_SUPPORT_URL } from "@/lib/support";
import { useBusinessDetails } from "@/hooks/use-business-settings";
import { useActiveBusinessIndustry } from "@/hooks/use-active-business-industry";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useCountryContext } from "@/hooks/use-country-context";
import { businessIdDisplay } from "@/lib/country-context";

const BEAT = {
  headline: 700,
  firstRow: 1100,
  rowStep: 450,
  handoff: 3050,
};
const REDIRECT_AFTER_HANDOFF_MS = 1200;
const REDUCED_MOTION_REDIRECT_MS = 1200;

export function WelcomeCelebration() {
  const router = useRouter();
  const accountName = useAtomValue(authNameAtom);
  const reducedMotion = usePrefersReducedMotion();

  const { values: business, loading } = useBusinessDetails();
  const industry = useActiveBusinessIndustry();
  const hydrated = !loading;

  /*
   * The registration number row, in this country's own terms.
   *
   * Read from the business record rather than from the form values, which only
   * carry `abn` — Australia's legacy column. A New Zealand business keeps its
   * NZBN in `business_registration_number`, so the form value is empty and this
   * row used to vanish for every country but one. `businessIdDisplay` knows
   * which column to read, what the country calls it, and how it spaces it.
   */
  const { business: businessRecord } = useActiveBusiness();
  const { country } = useCountryContext();
  const businessId = businessIdDisplay(country, businessRecord);

  useCelebrationConfetti();

  React.useEffect(() => {
    const delay = reducedMotion
      ? REDUCED_MOTION_REDIRECT_MS
      : BEAT.handoff + REDIRECT_AFTER_HANDOFF_MS;
    const timer = setTimeout(() => router.replace("/dashboard"), delay);
    return () => clearTimeout(timer);
  }, [reducedMotion, router]);

  const firstName = titleCaseName(accountName.trim().split(/\s+/)[0] ?? "");
  
  const recap: { icon: LucideIcon; label: string }[] = hydrated
    ? [
        { icon: Building2, label: business.businessName.trim() || "Your business" },
        ...(industry.trim() &&
        industry.trim() !== UNSPECIFIED_INDUSTRY
          ? [
              {
                icon: Tag,
                label: `Invoice templates · ${industry.trim()}`,
              },
            ]
          : []),
        ...(businessId
          ? [
              {
                icon: Hash,
                label: `${businessId.label} · ${businessId.value}`,
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="relative min-h-svh overflow-hidden bg-primary">
      {/* Brighter through the middle, so the field has a centre rather than
          reading as one flat fill. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,#6E6EFF_0%,#4D4DFE_42%,#2B2BA8_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.22),transparent_55%)]"
        aria-hidden
      />

      <div className="relative grid min-h-svh place-items-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center">
            <SuccessMark />
          </div>

          <div
            className="animate-fade-rise mt-8 space-y-2"
            style={{ animationDelay: `${BEAT.headline}ms` }}
          >
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              {firstName ? `You're all set, ${firstName}` : "You're all set"}
            </h1>
            <p className="text-sm text-white/70">
              Your workspace is ready. We&apos;ll ask a couple of quick
              questions on the dashboard to tailor it.
            </p>
          </div>

          <ul className="mt-10 space-y-3 text-left">
            {recap.map((row, index) => (
              <li
                key={row.label}
                className="animate-fade-rise flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3 backdrop-blur-sm"
                style={{
                  animationDelay: `${BEAT.firstRow + index * BEAT.rowStep}ms`,
                }}
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/15 text-white"
                  aria-hidden
                >
                  <row.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {row.label}
                </span>
                <Check className="size-4 shrink-0 text-white" aria-hidden />
              </li>
            ))}
          </ul>

          <div
            className="animate-fade-rise mt-10 space-y-3"
            style={{ animationDelay: `${BEAT.handoff}ms` }}
          >
            <p className="text-sm text-white/80" role="status">
              Taking you to your dashboard…
            </p>
            {/* Indeterminate: the wait is a fixed length, but the bar isn't
                measuring it, so it shouldn't pretend to. */}
            <div
              className="mx-auto h-1 w-48 overflow-hidden rounded-full bg-white/20"
              aria-hidden
            >
              <div className="animate-slide-through h-full w-[30%] rounded-full bg-white" />
            </div>

            {/* The only interactive thing here: a way past the wait. */}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-sm pt-1 text-sm font-medium text-white underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Go to dashboard now
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>

          <p className="mt-10 text-xs text-white/60">
            Need a hand?{" "}
            <a
              href={SCHEDULE_SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline underline-offset-2 hover:text-white/80"
            >
              Book a free setup call
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
