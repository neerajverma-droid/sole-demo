"use client";
import { SoleLogo } from "@/components/layout/sole-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function OnboardingLayout({
  preview,
  children,
}: {
  preview?: React.ReactNode;
  children: React.ReactNode;
}) {

  return (
    <div className="relative isolate min-h-svh bg-background">
      <AmbientGlow />
      <div className="relative flex items-center justify-end px-6 py-6 sm:px-10">
        <div className="mr-auto">
          <SoleLogo />
        </div>
        <ThemeToggle />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 sm:px-10">
        {preview ? (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-12">
            <div className="lg:sticky lg:top-8 lg:self-start">{preview}</div>
            <div>{children}</div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl">{children}</div>
        )}
      </div>
    </div>
  );
}

function AmbientGlow() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div className="animate-ambient-drift-a absolute -left-[14vw] top-[32%] size-[26vw] rounded-full bg-primary/[0.20] blur-3xl will-change-transform dark:bg-primary/[0.26]" />
      <div
        // Started mid-phase, so the pair doesn't set off from rest together.
        style={{ animationDelay: "-9s" }}
        className="animate-ambient-drift-b absolute -right-[13vw] bottom-[4%] size-[28vw] rounded-full bg-primary/[0.16] blur-3xl will-change-transform dark:bg-primary/[0.22]"
      />
    </div>
  );
}
