"use client";

import * as React from "react";
import { CalendarClock, CalendarX2, Clock, Globe, MapPin, Video } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { SoleLogo } from "@/components/layout/sole-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { initials } from "@/lib/booking-links";
import {
  availabilitySummary,
  durationLabel,
  hostName,
  hostPicture,
  isInPerson,
  meetingLabel,
  themeGradient,
  type PublicBookingLink,
} from "@/lib/public-booking";
import { cn } from "@/lib/utils";

/** The host's two colours, carried to every themed control on the page. */
export type HostTheme = { color: string; text: string };

/** The page around every public booking screen: a centred card and the Sole footer. */
export function BookingPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      {/* Guests land here without an account, so the theme switch the app
          keeps in its top bar lives here instead — as on the sign-in screens. */}
      <header className="mx-auto flex w-full max-w-5xl justify-end px-4 pt-3">
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-6 pt-2 sm:items-center sm:pb-10">
        <div className="w-full max-w-5xl">{children}</div>
      </main>
      <footer className="flex items-center justify-center gap-2 pb-6 text-xs text-muted-foreground">
        Powered by
        <a href="https://getsole.ai" target="_blank" rel="noreferrer" aria-label="Sole">
          <SoleLogo className="h-5" />
        </a>
      </footer>
    </div>
  );
}

/** The card itself: the host on the left (on top on a phone), the step on the right. */
export function BookingCard({
  side,
  children,
}: {
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        side && "grid lg:grid-cols-[320px_minmax(0,1fr)]",
      )}
    >
      {side}
      <section className="min-w-0 p-5 sm:p-8">{children}</section>
    </div>
  );
}

/** A primary button in the host's colour rather than Sole's. */
export function ThemedButton({
  theme,
  style,
  className,
  ...props
}: ButtonProps & { theme: HostTheme }) {
  return (
    <Button
      {...props}
      className={cn("hover:opacity-90", className)}
      style={{ backgroundColor: theme.color, color: theme.text, ...style }}
    />
  );
}

export function HostAvatar({ link, className }: { link: PublicBookingLink; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const picture = hostPicture(link);
  const name = hostName(link);
  if (picture && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the host's uploaded photo on another host
      <img
        src={picture}
        alt={name}
        onError={() => setFailed(true)}
        className={cn(
          "size-14 shrink-0 rounded-full border-2 border-white/40 object-cover",
          className,
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid size-14 shrink-0 place-items-center rounded-full border-2 border-white/40 bg-white/20 text-lg font-semibold",
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function MetaRow({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 opacity-80" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

/**
 * Who you're booking with and what — in the host's colours, as the old
 * page's left panel was. On a phone it sits above the steps.
 */
export function HostPanel({
  link,
  theme,
  timezone,
}: {
  link: PublicBookingLink;
  theme: HostTheme;
  timezone: string;
}) {
  const days = availabilitySummary(link);
  return (
    <aside
      className="flex flex-col gap-5 p-5 sm:p-8"
      style={{ background: themeGradient(theme.color), color: theme.text }}
    >
      <div className="flex items-center gap-3 lg:flex-col lg:items-start">
        <HostAvatar link={link} />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider opacity-75">
            {hostName(link)}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold leading-tight">{link.title}</h1>
        </div>
      </div>

      <ul className="space-y-2.5">
        <MetaRow icon={Clock}>{durationLabel(link)}</MetaRow>
        <MetaRow icon={isInPerson(link) ? MapPin : Video}>{meetingLabel(link)}</MetaRow>
        <MetaRow icon={Globe}>{timezone.replace(/_/g, " ")}</MetaRow>
      </ul>

      {days.length > 0 && (
        <div
          className="hidden border-t border-current/20 pt-4 lg:block"
          style={{ borderColor: `${theme.text}33` }}
        >
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider opacity-75">
            <CalendarClock className="size-3.5" />
            Available
          </p>
          <ul className="space-y-1 text-[13px] opacity-90">
            {days.map((day) => (
              <li key={day}>{day}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

export function BookingPageSkeleton() {
  return (
    <BookingPage>
      <div className="grid overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 bg-muted/50 p-8">
          <Skeleton className="size-14 rounded-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-48" />
          <div className="space-y-2.5 pt-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="space-y-5 p-8">
          <Skeleton className="h-6 w-56" />
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }, (_, index) => (
              <Skeleton key={index} className="aspect-square rounded-full" />
            ))}
          </div>
        </div>
      </div>
    </BookingPage>
  );
}

/** A link that doesn't exist, a booking that's gone — said plainly, in the app's empty state. */
export function BookingProblem({ title, message }: { title: string; message: string }) {
  return (
    <BookingPage>
      <Empty className="mx-auto max-w-lg">
        <EmptyMedia>
          <CalendarX2 />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </Empty>
    </BookingPage>
  );
}
