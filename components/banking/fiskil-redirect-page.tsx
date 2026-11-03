"use client";

import { useRouter } from "next/navigation";
import { CircleCheck, CircleX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SoleLogo } from "@/components/layout/sole-logo";

/**
 * What Fiskil (the CDR provider) redirects the iframe to once the user
 * finishes or cancels the consent journey. Its only job is telling the
 * parent window (the dialog that opened the iframe) that the flow is done —
 * mirrors `sole-webapp/pages/fiskil-success.js` / `fiskil-cancel.js` exactly,
 * including the same-origin check and the top-level-redirect fallback.
 *
 * Waits for a button click rather than posting automatically on mount, so
 * there's a moment to read what happened before bouncing back into the app.
 */
export function FiskilRedirectPage({
  tone,
  title,
  description,
}: {
  tone: "success" | "cancel";
  title: string;
  description: string;
}) {
  const router = useRouter();
  // A Lucide icon is a component, not RSC-serializable data — resolved here
  // from `tone` rather than taken as a prop, since the page that renders this
  // (a Server Component) can't hand one across the boundary.
  const Icon = tone === "success" ? CircleCheck : CircleX;

  const navigate = (target: string) => {
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: "FISKIL_NAVIGATE", target },
        window.location.origin,
      );
      return;
    }
    // No parent frame — Fiskil redirected top-level rather than inside the
    // iframe (some mobile webviews do this). Just go there directly.
    router.push(target);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
      <SoleLogo className="h-8" />

      <Empty className="max-w-sm">
        <EmptyMedia
          className={
            tone === "success"
              ? "bg-success/10 text-success"
              : "bg-muted text-muted-foreground"
          }
        >
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
        <EmptyActions>
          <Button onClick={() => navigate("/dashboard")}>
            Go to dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate("/transactions")}>
            Back to Transactions
          </Button>
        </EmptyActions>
      </Empty>
    </div>
  );
}
