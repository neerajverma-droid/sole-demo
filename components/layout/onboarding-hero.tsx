"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type LifecycleNode = {
  label: string;
  icon: LucideIcon;
  tone?: "success" | "warning" | "danger";
  /** The resolved outcome breathes, so the eye lands on it. */
  glow?: boolean;
};

/**
 * The two-column onboarding hero from the prototype: pitch and actions on the
 * left, a floating document preview on the right, and a lifecycle fork
 * underneath. Shared by Transactions and Quotes, which follow the same shape.
 */
export function OnboardingHero({
  eyebrow,
  title,
  body,
  benefits,
  actions,
  caption,
  secondary,
  preview,
  lifecycle,
}: {
  eyebrow: string;
  title: string;
  body: string;
  benefits: { icon: LucideIcon; title: string; body: string }[];
  actions: React.ReactNode;
  caption: string;
  secondary?: { label: string; children: React.ReactNode };
  preview: React.ReactNode;
  /** The flow forks after the trunk — one good branch, one that needs you. */
  lifecycle: {
    title: string;
    trunk: LifecycleNode[];
    branches: [LifecycleNode, LifecycleNode];
    body: string;
  };
}) {
  return (
    <div className="space-y-6">
      <section className="grid items-center gap-10 rounded-lg border border-border bg-card p-6 shadow-sm lg:grid-cols-2 lg:p-10">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            <span className="text-[11.5px] font-bold text-primary">
              {eyebrow}
            </span>
          </span>

          <div className="space-y-3">
            <h2 className="text-balance text-[34px] font-extrabold leading-[1.08] tracking-[-1.1px]">
              {title}
            </h2>
            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
              {body}
            </p>
          </div>

          <ul className="space-y-4">
            {benefits.map((benefit) => (
              <li key={benefit.title} className="flex items-start gap-3">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
                  aria-hidden
                >
                  <benefit.icon className="size-4" />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{benefit.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {benefit.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
            <p className="text-xs text-muted-foreground">{caption}</p>
          </div>

          {secondary && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <span className="text-xs text-muted-foreground">
                {secondary.label}
              </span>
              {secondary.children}
            </div>
          )}
        </div>

        <div className="flex min-w-0 justify-center py-6">{preview}</div>
      </section>

      <LifecycleStrip {...lifecycle} />
    </div>
  );
}

/**
 * A floating document: the card tilted one way, a soft indigo block tilted the
 * other behind it, and a shadow deep enough to lift it off the page.
 */
export function FloatingPreview({
  children,
  stamp,
}: {
  children: React.ReactNode;
  stamp: { label: string; tone: "success" | "warning" };
}) {
  return (
    <div className="relative w-[326px] shrink-0">
      <div
        className="absolute inset-0 -m-3 rotate-[4deg] rounded-[18px] bg-primary/10"
        aria-hidden
      />
      <div
        className="animate-sway relative rounded-[18px] border border-border bg-card p-5"
        style={{ boxShadow: "0 24px 60px -18px rgba(16,24,40,0.28)" }}
      >
        {/* A stamp, pressed on at an angle — not a flat pill. */}
        <span
          className={cn(
            "absolute -right-3 -top-3 -rotate-[8deg] rounded-md border-2 bg-card px-2 py-1",
            "text-[11px] font-extrabold uppercase tracking-wide",
            stamp.tone === "success"
              ? "border-success/50 text-success"
              : "border-warning/50 text-warning",
          )}
        >
          {stamp.label}
        </span>
        {children}
      </div>
    </div>
  );
}

function LifecycleStrip({
  title,
  trunk,
  branches,
  body,
}: {
  title: string;
  trunk: LifecycleNode[];
  branches: [LifecycleNode, LifecycleNode];
  body: string;
}) {
  return (
    <section className="space-y-5 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>

      <div className="stagger flex flex-wrap items-center justify-center gap-3">
        {trunk.map((node) => (
          <div key={node.label} className="flex items-center gap-3">
            <Node node={node} />
            <FlowArrow />
          </div>
        ))}

        {/* The fork: one branch resolves, the other needs you. */}
        <div className="flex flex-col gap-2">
          <Node node={branches[0]} />
          <Node node={branches[1]} />
        </div>
      </div>

      <p className="mx-auto max-w-[520px] text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </section>
  );
}

function Node({ node }: { node: LifecycleNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold",
        node.tone === "success" &&
          "border-success/20 bg-success/10 text-success",
        node.tone === "warning" &&
          "border-warning/20 bg-warning/10 text-warning",
        node.tone === "danger" &&
          "border-destructive/20 bg-destructive/10 text-destructive",
        // Neutral nodes are brand-tinted, not grey.
        !node.tone && "border-primary/20 bg-primary/[0.04]",
        node.glow && "animate-glow",
      )}
    >
      <node.icon
        className={cn("size-3.5 shrink-0", !node.tone && "text-primary")}
        aria-hidden
      />
      {node.label}
    </span>
  );
}

/** Dashed indigo arrow whose dashes travel, so the flow reads as moving. */
function FlowArrow() {
  return (
    <svg
      width="34"
      height="10"
      viewBox="0 0 34 10"
      className="shrink-0 text-primary"
      aria-hidden
    >
      <line
        x1="0"
        y1="5"
        x2="26"
        y2="5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="4 4"
        className="animate-flow"
      />
      <path
        d="M26 1.5 L31 5 L26 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
