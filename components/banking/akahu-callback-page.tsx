"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SoleLogo } from "@/components/layout/sole-logo";
import { invalidateBankAccounts } from "@/hooks/use-bank-accounts-query";
import { apiErrorMessage } from "@/lib/api-error";
import { completeAkahuConnection } from "@/lib/bank-connection";

type Status =
  | { kind: "working" }
  | { kind: "connected" }
  | { kind: "cancelled" }
  | { kind: "failed"; message: string };

/**
 * Where Akahu (New Zealand's bank feed) sends the browser back to after
 * consent, with `code` and `state` — or `error` when the user declined.
 *
 * Unlike Fiskil's /fiskil-success, this isn't inside an iframe: Akahu's flow
 * takes the whole page, so this page finishes the connection itself and then
 * offers the way back into the app.
 *
 * The code is single-use and expires within a minute, so it is posted once,
 * on arrival — guarded by a ref because React runs effects twice in
 * development, and a second exchange of the same code would fail.
 */
export function AkahuCallbackPage() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<Status>({ kind: "working" });
  const started = React.useRef(false);

  const code = params?.get("code") ?? null;
  const state = params?.get("state") ?? null;
  const error = params?.get("error") ?? null;

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (error === "access_denied") {
      setStatus({ kind: "cancelled" });
      return;
    }
    if (error) {
      setStatus({
        kind: "failed",
        message: params?.get("error_description") || "Akahu couldn't start the connection.",
      });
      return;
    }

    completeAkahuConnection({ code, state, error })
      .then((result) => {
        setStatus({ kind: result });
        if (result === "connected") invalidateBankAccounts(queryClient);
      })
      .catch((err) =>
        setStatus({ kind: "failed", message: apiErrorMessage(err, "Couldn't finish connecting your bank.") }),
      );
  }, [code, state, error, params, queryClient]);

  if (status.kind === "working") {
    return (
      <Shell>
        <Empty className="max-w-sm">
          <EmptyMedia className="bg-muted text-muted-foreground">
            <Loader2 className="animate-spin" aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Connecting your bank…</EmptyTitle>
          <EmptyDescription>Finishing up with Akahu. This takes a few seconds.</EmptyDescription>
        </Empty>
      </Shell>
    );
  }

  const content = {
    connected: {
      Icon: CircleCheck,
      tint: "bg-success/10 text-success",
      title: "Bank connection complete",
      description: "Your accounts will appear shortly — it can take a few minutes for the first sync to finish.",
    },
    cancelled: {
      Icon: CircleX,
      tint: "bg-muted text-muted-foreground",
      title: "Connection cancelled",
      description: "No bank account was connected. You can try again any time from Connected accounts.",
    },
    failed: {
      Icon: TriangleAlert,
      tint: "bg-destructive/10 text-destructive",
      title: "Couldn't connect your bank",
      description: status.kind === "failed" ? status.message : "",
    },
  }[status.kind];

  return (
    <Shell>
      <Empty className="max-w-sm">
        <EmptyMedia className={content.tint}>
          <content.Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{content.title}</EmptyTitle>
        <EmptyDescription>{content.description}</EmptyDescription>
        <EmptyActions>
          {status.kind === "failed" ? (
            <Button onClick={() => router.push("/transactions?addBankAccount=1")}>Try again</Button>
          ) : (
            <Button onClick={() => router.push("/dashboard")}>Go to dashboard</Button>
          )}
          <Button variant="outline" onClick={() => router.push("/transactions")}>
            Back to Transactions
          </Button>
        </EmptyActions>
      </Empty>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
      <SoleLogo className="h-8" />
      {children}
    </div>
  );
}
