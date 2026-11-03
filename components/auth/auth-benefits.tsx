"use client";

import {
  BadgePercent,
  BarChart3,
  FileText,
  PiggyBank,
  Receipt,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type Benefit = { icon: LucideIcon; label: string };

/**
 * What the product does for you, on the promo panel.
 *
 * Two per row: five in one column read as a long list, and pairs scan faster.
 * The fifth wraps onto a third row on its own, which is fine — the grid keeps
 * the columns aligned rather than leaving a ragged edge.
 */
const BENEFITS: Benefit[] = [
  { icon: FileText, label: "Unlimited professional quotes & invoices" },
  { icon: Receipt, label: "Never lose a receipt again" },
  { icon: BarChart3, label: "Track your business performance in real time" },
  { icon: BadgePercent, label: "Enjoy special partner offers" },
  { icon: PiggyBank, label: "No more tax surprises" },
];

/** Initials rather than photographs: no invented faces on a trust strip. */
const AVATARS = [
  {
    src: "https://assets.cdn.filesafe.space/o7TKHaN6MPkNHIKqhoAY/media/66f3edf726eedbe00026c691.png",
    initials: "JM",
    tint: "bg-indigo-500",
  },
  {
    src: "https://assets.cdn.filesafe.space/o7TKHaN6MPkNHIKqhoAY/media/66f3ed193d38ab90b027f5bb.png",
    initials: "AT",
    tint: "bg-teal-500",
  },
  {
    src: "/images/avatar/stephen_burns.jpeg",
    initials: "RK",
    tint: "bg-orange-500",
  },
];

export function AuthBenefits({
  firstDelay,
  step,
}: {
  /** When the eyebrow lands, in milliseconds. The rows follow it. */
  firstDelay: number;
  /** The gap between rows. */
  step: number;
}) {
  return (
    // The mockup above is floating, so the block needs real distance from it
    // rather than the column's own gap.
    <div className="mt-10 space-y-5 xl:mt-12">
      <p
        className="animate-fade-rise text-xs font-semibold uppercase tracking-wide text-white/60"
        style={{ animationDelay: `${firstDelay}ms` }}
      >
        Everything you get
      </p>

      <ul className="grid grid-cols-2 gap-x-8 gap-y-5">
        {BENEFITS.map((benefit, index) => (
          <li
            key={benefit.label}
            className="animate-fade-rise flex items-center gap-3"
            style={{ animationDelay: `${firstDelay + step + index * step}ms` }}
          >
            {/*
              White tile, indigo icon: on the gradient a tinted tile would sink
              into it. The breath is staggered per tile and long enough not to
              read as a blink — it starts once the panel has finished arriving.
            */}
            <span
              className="animate-auth-pulse grid size-11 shrink-0 place-items-center rounded-full bg-white text-primary shadow-sm"
              style={{ animationDelay: `${1400 + index * 400}ms` }}
              aria-hidden
            >
              <benefit.icon className="size-5" />
            </span>
            <span className="text-sm font-medium leading-snug text-white">
              {benefit.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuthTrustStrip({ delay }: { delay: number }) {
  return (
    <div
      className="animate-fade-rise flex flex-wrap items-center gap-4 pt-1"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex -space-x-2">
        {AVATARS.map((avatar, index) => (
          <div
            key={index}
            className={`w-8 h-8 rounded-full border-1 border-white overflow-hidden ${avatar.tint}`}
          >
            {avatar.src ? (
              <img
                src={avatar.src}
                alt={avatar.initials}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-xs font-medium text-white">
                {avatar.initials}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm font-medium text-white">
        Trusted by 15,000+ Australian businesses
      </p>
    </div>
  );
}
