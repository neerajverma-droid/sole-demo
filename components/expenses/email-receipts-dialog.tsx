"use client";

import * as React from "react";
import { BookUser, Check, Copy, Inbox, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { useReceiptAddressQuery } from "@/hooks/use-receipt-address-query";

/** How long the Copy button stays on "Copied" before it resets. */
const COPIED_MS = 2500;

/**
 * Expenses → Email receipts.
 *
 * Shows the business's own forwarding address — mail sent to it is read by
 * Sole's receipt parser and turned into an expense. The address comes from
 * `GET /inbound-email/receipt-address`, the endpoint sole-webapp's
 * `EmailReceiptCard` uses; nothing about it is generated or stored here.
 */
export function EmailReceiptsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useReceiptAddressQuery(open);
  const address = query.data;

  const [copied, setCopied] = React.useState(false);
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  // Reopening shouldn't greet the user with a stale "Copied".
  React.useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // Insecure context or a denied permission — the address is still
      // selectable in the field, so say so instead of failing silently.
      toast.error("Couldn't copy automatically. Select the address and copy it.");
      return;
    }
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-6 p-6 sm:p-8">
        <DialogHeader className="items-center space-y-3 text-center sm:text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="size-8" aria-hidden />
          </div>
          <DialogTitle className="text-2xl font-semibold">
            Forward email receipts
          </DialogTitle>
          <DialogDescription className="mx-auto max-w-md">
            Send any receipt to your unique address below and Sole will
            automatically create an expense for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label
            htmlFor="receipt-address"
            className="text-sm font-medium text-foreground"
          >
            Your unique forwarding address
          </label>

          {query.isPending ? (
            <div
              role="status"
              className="flex h-12 items-center justify-center gap-2 rounded-lg border bg-muted/40 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Generating address…
            </div>
          ) : query.isError ? (
            <div
              role="alert"
              className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive"
            >
              <span>
                {apiErrorMessage(
                  query.error,
                  "Could not load your receipt address. Please try again.",
                )}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => query.refetch()}
                disabled={query.isFetching}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-lg border bg-background px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
                <Mail
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="receipt-address"
                  type="text"
                  readOnly
                  value={address}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium outline-none"
                />
              </div>
              <Button
                type="button"
                onClick={copy}
                className="h-12 shrink-0 px-5"
                aria-live="polite"
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            This address is unique to this business. Do not share it publicly.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Inbox className="size-4" aria-hidden />
              </span>
              <h3 className="text-sm font-semibold">How it works</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              When you receive an Uber, Amazon, or any other receipt, forward it
              to this address. Sole&apos;s AI reads the receipt and creates the
              expense automatically.
            </p>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BookUser className="size-4" aria-hidden />
              </span>
              <h3 className="text-sm font-semibold">Pro tip</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Save this email address to your phone contacts as{" "}
              <strong className="font-semibold text-foreground">
                &quot;Sole Receipts&quot;
              </strong>
              . Next time you get a receipt, just forward it in 2 taps.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
