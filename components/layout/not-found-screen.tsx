"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";

import { Button } from "@/components/ui/button";

/** The Sole mark from the loading screen, standing in for the "0". */
function SoleMark() {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden
      className="size-[0.8em] motion-safe:animate-spin"
      style={{ animationDuration: "6s" }}
    >
      <circle cx="100" cy="28" r="10" fill="currentColor" />
      <circle cx="100" cy="172" r="10" fill="currentColor" />
      <path d="M24 100 H66" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <path d="M134 100 H176" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <path d="M123 77 L158 42" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <path d="M42 158 L77 123" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <path d="M42 42 L158 158" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Page not found — the old app's 404 (a big visual, one line, Go back) in
 * this app's theme, on its own without the app shell.
 */
export function NotFoundScreen() {
  const router = useRouter();

  const goBack = () => {
    // Opened straight from a link there's nothing to go back to.
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="max-w-md text-center">
          <p
            className="flex items-center justify-center gap-1 text-[96px] font-extrabold leading-none tracking-tight text-foreground sm:text-[120px]"
            aria-hidden
          >
            <span>4</span>
            <span className="text-primary">
              <SoleMark />
            </span>
            <span>4</span>
          </p>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Page not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sorry, we couldn&apos;t find the page you were looking for. It may have moved, or the
            link may be mistyped.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft />
              Go back
            </Button>
            <Button asChild>
              <Link href="/">
                <Home />
                Go to Sole
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
