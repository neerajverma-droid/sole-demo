"use client";

import { Activity, Building2, ShieldCheck, type LucideIcon } from "lucide-react";

import { SoleLogo } from "@/components/layout/sole-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const POINTS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Building2,
    title: "Manage tenant workspaces",
    body: "Create tenants, set their seats and branding, and suspend or reactivate them.",
  },
  {
    icon: ShieldCheck,
    title: "Support users securely",
    body: "Find any account, sign in as a user to see what they see, and every action is logged.",
  },
  {
    icon: Activity,
    title: "Monitor platform health",
    body: "Customer health, activation, growth and support in the Command Centre.",
  },
];

/**
 * The split screen for the admin sign-in.
 *
 * Same frame as `AuthLayout` — form on the right, a panel on the left from
 * `lg` up — but a different panel on purpose. The product promo sells Sole to
 * a business owner; someone signing in here already works on it, so the panel
 * says what this console is for and that it's a restricted area. The ink hero
 * surface rather than the indigo gradient is what makes the two doors
 * impossible to mistake for each other at a glance.
 */
export function AdminAuthLayout({
  heading,
  subtext,
  children,
  footer,
}: {
  heading: string;
  subtext?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh bg-background">
      {/* Form — first in the source so a keyboard lands here before the panel. */}
      <div className="flex min-h-svh w-full flex-col px-6 py-8 sm:px-10 lg:order-2 lg:w-1/2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SoleLogo />
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-destructive">
              Admin
            </span>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px] space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">{heading}</h1>
              {subtext && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {subtext}
                </p>
              )}
            </div>

            {children}

            {footer && (
              <div className="text-center text-sm text-muted-foreground">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel — on the left from lg up, absent below it. */}
      <div className="relative hidden w-1/2 overflow-hidden bg-hero text-hero-foreground lg:order-1 lg:flex lg:flex-col">
        <div className="relative flex flex-1 flex-col justify-center gap-10 px-12 py-12 xl:px-16">
          <div className="max-w-md space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-hero-muted">
              Sole platform administration
            </p>
            <h2 className="animate-fade-rise text-4xl font-semibold leading-[1.15] tracking-tight">
              Run the platform behind every Sole business.
            </h2>
          </div>

          <ul className="max-w-md space-y-3">
            {POINTS.map(({ icon: Icon, title, body }, index) => (
              <li
                key={title}
                className="animate-fade-rise flex gap-4 rounded-lg border border-hero-border bg-hero-raised p-4"
                style={{ animationDelay: `${120 + index * 70}ms` }}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/20 text-primary-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-sm leading-relaxed text-hero-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative border-t border-hero-border px-12 py-6 text-xs text-hero-muted xl:px-16">
          Restricted area. Access is granted by a super admin and every session is
          recorded.
        </div>
      </div>
    </div>
  );
}
