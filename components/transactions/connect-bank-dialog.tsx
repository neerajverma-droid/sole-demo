"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { connectBankAuthUrlAtom, connectBankOpenAtom } from "@/lib/atoms";
import { startBankConnection } from "@/lib/bank-connection";
import { invalidateBankAccounts } from "@/hooks/use-bank-accounts-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { apiErrorMessage } from "@/lib/api-error";
import { bankFeedName, bankFeedProvider } from "@/lib/country-context";
import axios from "axios";

/** How long after the flow ends before re-checking accounts once more, to
 *  catch the webhook sync landing a moment after the redirect does. */
const REFETCH_SETTLE_MS = 4000;

/**
 * The provider's own hosted flow — bank search and consent both happen inside
 * it, so this dialog has no steps of its own beyond "start the connection" and
 * "show it". Mirrors sole-webapp's `ManageAccounts.js` iframe modal.
 *
 * Which provider is the business's country's: Fiskil (Australia) runs in the
 * iframe here; Akahu (New Zealand) hands off to the bank's own login, which
 * won't load in a frame, so for Akahu the whole page goes there instead and
 * comes back to `/akahu-callback`.
 */
export function ConnectBankDialog() {
  const [open, setOpen] = useAtom(connectBankOpenAtom);
  const [prefetchedUrl, setPrefetchedUrl] = useAtom(connectBankAuthUrlAtom);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { country, loading: countryLoading } = useCountryContext();
  const provider = bankFeedProvider(country);
  const providerName = bankFeedName(country);

  const {
    mutate: connect,
    data: fetchedUrl,
    isPending: fetching,
    isError,
    reset,
  } = useMutation({
    mutationFn: () => startBankConnection(provider),
    // The inline retry state stays; the toast is what sole-webapp shows.
    onError: (error) =>
      toast.error(
        apiErrorMessage(
          error,
          error instanceof Error && !axios.isAxiosError(error)
            ? error.message
            : "Couldn't start the bank connection. Try again.",
        ),
      ),
  });

  const authUrl = prefetchedUrl ?? fetchedUrl;
  const isPending = !prefetchedUrl && fetching;

  // Start the connection each time the dialog opens, unless the opener
  // already fetched the link; forget it all on close. Waits for the country
  // while it's loading, so an NZ business never starts Fiskil's flow by mistake.
  React.useEffect(() => {
    if (open) {
      if (!prefetchedUrl && !countryLoading) connect();
    } else {
      reset();
      setPrefetchedUrl(null);
    }
    // `connect`/`reset` are stable across renders (react-query); `open` is the
    // real trigger, and the link is read as it stood when it opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, countryLoading]);

  // Akahu: leave for its site as soon as there's a link.
  React.useEffect(() => {
    if (open && authUrl && provider === "akahu") {
      window.location.assign(authUrl);
    }
  }, [open, authUrl, provider]);

  // Fiskil redirects the iframe to our own /fiskil-success or /fiskil-cancel
  // page, which posts this message up to us once the user acts on it.
  React.useEffect(() => {
    if (!open) return;

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const payload =
        typeof event.data === "string" ? safeParse(event.data) : event.data;
      if (payload?.type !== "FISKIL_NAVIGATE") return;

      setOpen(false);
      toast.message("Bank connection finished — refreshing your accounts");

      const refetch = () => invalidateBankAccounts(queryClient);
      refetch();
      // The sync into our DB happens async via a webhook, so one refetch
      // right away can still miss it.
      setTimeout(refetch, REFETCH_SETTLE_MS);

      router.push(typeof payload.target === "string" ? payload.target : "/dashboard");
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, setOpen, queryClient, router]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Closed by hand mid-flow: the consent may still have gone through,
        // so re-read the accounts (sole-webapp reloads the page here).
        if (!next && authUrl) invalidateBankAccounts(queryClient);
      }}
    >
      {/*
        Full-screen and transparent, as sole-webapp's: Fiskil's page brings its
        own modal and backdrop, so a card of ours around it read as a second
        modal. Only a floating close button is ours.
      */}
      <DialogContent
        hideClose
        className="left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">Connect your bank</DialogTitle>
        <DialogDescription className="sr-only">
          {providerName}&apos;s secure, read-only bank connection flow.
        </DialogDescription>

        {/*
          Ours, always — as sole-webapp keeps its own. Fiskil's ✕ only ends
          the consent session inside its page (showing "Either you denied
          consent…") without redirecting back to us, so we never learn the
          flow ended; and its page is cross-origin, so that can't be caught.
          This one is the reliable way out, and refreshes the accounts.
        */}
        {/* sole-webapp's close: reload the page, so the accounts, balances
            and transactions all come back fresh after a connection attempt. */}
        <Button
          variant="outline"
          size="icon"
          className="absolute right-5 top-5 z-10 size-10 rounded-full bg-background shadow-md"
          aria-label="Close bank connection"
          onClick={() => {
            setOpen(false);
            window.location.reload();
          }}
        >
          <X />
        </Button>

        <div className="min-h-0 flex-1">
          {isPending || (countryLoading && !authUrl) ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-3 text-sm text-muted-foreground shadow-lg">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Connecting to your bank…
              </div>
            </div>
          ) : isError ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg bg-background p-6 text-center shadow-lg">
                <AlertCircle className="size-6 text-destructive" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Couldn&apos;t start the bank connection. Try again.
                </p>
                <Button variant="outline" size="sm" onClick={() => connect()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : authUrl && provider === "akahu" ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-3 text-sm text-muted-foreground shadow-lg">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Taking you to {providerName}…
              </div>
            </div>
          ) : authUrl ? (
            <iframe
              src={authUrl}
              className="h-full w-full border-0"
              title="Connect your bank"
              allow="clipboard-write"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function safeParse(value: string): { type?: string; target?: unknown } | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
