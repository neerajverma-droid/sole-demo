import Link from "next/link";

import { SoleLogo } from "@/components/layout/sole-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * The frame around the public /resource pages. Visitors arrive without an
 * account, so — like the booking and sign-in screens — the theme switch lives
 * here rather than in the app's top bar.
 */
export function ResourceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/resource"
            aria-label="Sole resources"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SoleLogo className="h-6" />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
