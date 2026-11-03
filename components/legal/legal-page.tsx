import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SoleLogo } from "@/components/layout/sole-logo";

/**
 * The shell for a legal document. Reached from the auth screens, so it sits
 * outside the app shell — someone reading the terms before signing in has no
 * sidebar to sit inside.
 *
 * The bodies are placeholders: real policy copy is a legal deliverable, not
 * something to invent here. Each page says so rather than filling the space
 * with plausible-looking terms that nobody has approved.
 */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; body: string }[];
}) {
  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-10 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/login"
            aria-label="Sole home"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SoleLogo />
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">
              <ArrowLeft />
              Back to sign in
            </Link>
          </Button>
        </div>

        <div className="mt-10 space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground tabular">
            Last updated {updated}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {intro}
          </p>
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-border surface-subtle px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Placeholder — the final wording comes from Sole&apos;s legal
            counsel before launch.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <section key={section.heading} className="space-y-2">
              <h2 className="text-base font-semibold">{section.heading}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          Questions about this document?{" "}
          <a
            href="mailto:legal@sole.com.au"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            legal@sole.com.au
          </a>
        </p>
      </div>
    </div>
  );
}
