"use client";

import Link from "next/link";

import { SoleLogo } from "@/components/layout/sole-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AuthBenefits, AuthTrustStrip } from "@/components/auth/auth-benefits";
import { AuthPromoMockup } from "@/components/auth/auth-promo";

/**
 * The panel's entrance, in milliseconds — kept together so the sequence reads
 * as one composition rather than six numbers scattered through the markup.
 *
 * Copy first, then the mockup, then the trust strip. The mockup's own drift
 * starts once its entrance has finished (mockup + 600ms), so the two never
 * fight over the same property.
 */
const BEAT = {
  headline: 0,
  supporting: 80,
  mockup: 240,
  benefit: 560,
  benefitStep: 70,
  trust: 1030,
} as const;

/**
 * The split screen every auth screen composes: the brand promo on the left, the
 * form on the right.
 *
 * The promo is `hidden lg:flex` and the form column takes the full width below
 * that — on a phone the panel would be decoration pushing the form off-screen.
 *
 * The panel's gradient is a brand surface rather than a themed one, so its white
 * text is fixed in both modes, exactly as the dark hero cards elsewhere are. The
 * mockup inside it uses the semantic tokens and does follow the theme, since
 * it's a picture of the product the person is signing in to.
 */
export function AuthLayout({
  heading,
  subtext,
  children,
  footer,
  secondaryPath,
  promoHeadline,
  promoSupporting,
  topBarEnd,
}: {
  /**
   * Omitted on a success state: the confirmation card carries the message, and
   * a heading above it would say the same thing twice.
   */
  heading?: string;
  subtext?: string;
  children: React.ReactNode;
  /** The line under the form — "Don't have an account? Sign up". */
  footer?: React.ReactNode;
  /**
   * A different door entirely, below the footer and behind a rule — the
   * accountant sign-in, not another way to do what the form above does.
   */
  secondaryPath?: React.ReactNode;
  promoHeadline: string;
  promoSupporting: string;
  /**
   * Extra controls in the top bar, beside the theme toggle — a page-level
   * setting rather than part of the form, so it sits above the heading
   * rather than inside `children`.
   */
  topBarEnd?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh bg-background">
      {/*
        Form ----------------------------------------------------------

        First in the source, second on screen: `lg:order-2` puts it on the
        right without moving it in the DOM, so a keyboard lands in the form
        before the promo's links and a phone — where the promo is hidden
        entirely — has the form and nothing above it.
      */}
      <div className="flex min-h-svh w-full flex-col px-6 py-8 sm:px-10 lg:order-2 lg:w-1/2">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            aria-label="Sole home"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SoleLogo />
          </Link>
          {/* Auth has no top bar, and these screens have to be reviewable in
              both modes without going into the app first. */}
          <div className="flex items-center gap-1">
            {topBarEnd}
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-2">
          <div className="w-full max-w-[400px] space-y-6">
            {heading && (
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {heading}
                </h1>
                {subtext && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {subtext}
                  </p>
                )}
              </div>
            )}

            {children}

            {/*
              A div rather than a p, because what arrives here isn't always a
              phrase. Most callers pass bare text and a link and lean on this
              className for the typography — but the auth screen passes
              `AuthLegalLine`, which brings its own p, and a p inside a p is
              markup the browser silently un-nests and React then refuses to
              hydrate. The class list is unchanged, so the text callers render
              exactly as before.
            */}
            {footer && (
              <div className="text-center text-sm text-muted-foreground">
                {footer}
              </div>
            )}

            {secondaryPath && (
              <div className="border-t border-border pt-5">{secondaryPath}</div>
            )}
          </div>
        </div>
      </div>

      {/* Promo — on the left from lg up, absent below it. ------------- */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-primary via-primary to-[#3730A3] lg:order-1 lg:flex lg:flex-col">
        {/*
          The ambient glow: a soft darker mass off the bottom-right so the
          gradient has a centre of gravity rather than reading as a flat wash,
          and a lighter one top-left.

          Both drift and breathe, in opposite directions over different periods
          (see the keyframes), and both are clipped by the panel's own
          overflow-hidden — so neither can ever wander across the form. The
          negative delay starts the second one mid-phase, so they don't set off
          from rest together on first paint.

          Only the light one breathes its opacity, and only by 8%: it sits under
          white text, and thinning a dark mass under white text is the one
          direction that could cost contrast rather than add it.
        */}
        <div
          className="animate-ambient-drift-a pointer-events-none absolute -bottom-1/4 -right-1/4 size-[70%] rounded-full bg-[radial-gradient(circle,rgba(23,17,79,0.55),transparent_70%)]"
          aria-hidden
        />
        <div
          className="animate-ambient-drift-b pointer-events-none absolute -left-1/4 top-0 size-[60%] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.10),transparent_70%)]"
          style={{ animationDelay: "-9s" }}
          aria-hidden
        />

        <div className="relative flex flex-1 flex-col justify-center gap-8 px-12 py-12 xl:px-16">
          <div className="max-w-md space-y-4">
            <h2
              className="animate-fade-rise text-4xl font-semibold leading-[1.15] tracking-tight text-white"
              style={{ animationDelay: `${BEAT.headline}ms` }}
            >
              {promoHeadline}
            </h2>
            <p
              className="animate-fade-rise text-base leading-relaxed text-white/70"
              style={{ animationDelay: `${BEAT.supporting}ms` }}
            >
              {promoSupporting}
            </p>
          </div>

          {/*
            The panel crops what it can't fit, and with five benefits and the
            trust strip the mockup is what overflows first on a short screen.
            It's the most decorative thing here, so it's what gives way — the
            marketing copy stays.
          */}
          <div
            className="animate-auth-mockup-in [@media(max-height:860px)]:hidden"
            style={{ animationDelay: `${BEAT.mockup}ms` }}
          >
            <AuthPromoMockup />
          </div>

          <AuthBenefits firstDelay={BEAT.benefit} step={BEAT.benefitStep} />
        </div>

        {/* Its own band at the foot of the panel, with the rule and the padding
            keeping it clear of the benefits above. */}
        <div className="relative border-t border-white/15 px-12 pb-7 pt-7 xl:px-16">
          <AuthTrustStrip delay={BEAT.trust} />
        </div>
      </div>
    </div>
  );
}
