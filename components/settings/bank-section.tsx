"use client";

import * as React from "react";
import { useSetAtom } from "jotai";
import { Landmark, Loader2, Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { BankDetailsFields } from "@/components/settings/bank-details-fields";
import { SectionCard } from "@/components/settings/section-card";
import { useSectionDraft } from "@/components/settings/use-section-draft";
import { bankDraftAtom, connectBankIntroOpenAtom } from "@/lib/atoms";
import { bankDetailsIssue } from "@/components/settings/bank-details-fields";
import { apiErrorMessage } from "@/lib/api-error";
import { useBankDetails } from "@/hooks/use-business-settings";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useCountryContext } from "@/hooks/use-country-context";
import { useDashboardBankAccountsQuery } from "@/hooks/use-dashboard-query";
import { useAccountsStore } from "@/stores/accounts";

/**
 * Connected feeds, and the account clients pay into.
 *
 * Two different things, from two different places, which is why they were
 * both wrong before. The payout details are columns on the business record
 * and are read and written through `lib/business-settings.ts`. The connected
 * accounts are the live bank feed, which `useAccountsStore` already holds —
 * this screen used to show a hardcoded pair ("ANZ Business", "Up Savings")
 * from the old settings store instead, so Disconnect offered to remove
 * accounts that did not exist.
 */
export function BankSection() {
  const { country } = useCountryContext();
  const { values: stored, loading, save } = useBankDetails();
  const { business } = useActiveBusiness();

  /*
   * The feed is fetched here, not just read.
   *
   * `useAccountsStore` is filled by `useDashboardBankAccountsQuery`, which was
   * only ever mounted on the dashboard — so arriving at Settings directly
   * showed "No accounts connected" to an account with three of them. React
   * Query dedupes this against the dashboard's own copy.
   */
  const accountsQuery = useDashboardBankAccountsQuery();
  const accounts = useAccountsStore((state) => state.accounts);
  const removeAccount = useAccountsStore((state) => state.remove);
  // The explainer that gates the real Fiskil flow, mounted once in the top bar.
  const openConnectBank = useSetAtom(connectBankIntroOpenAtom);

  const { values, dirty, patch, reset } = useSectionDraft(
    stored,
    bankDraftAtom,
    business?.id ?? null,
  );

  const [disconnectId, setDisconnectId] = React.useState<string | null>(null);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // The shared fields show the inline errors; this only gates Save. The rules
  // are the business's country's — a BSB in Australia, a branch code in South
  // Africa, neither in New Zealand.
  const blocked = bankDetailsIssue(country, values);

  const pending = accounts.find((account) => account.id === disconnectId);

  const onSave = async () => {
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setSaving(true);
    try {
      await save(values);
      reset();
      toast.success("Payment details saved");
    } catch (error) {
      // Draft kept — this save can fail for real now.
      toast.error(apiErrorMessage(error, "Couldn't save your changes."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Bank & payments"
      description="Connect your bank to import transactions, and choose the account details clients see on your invoices."
      dirty={dirty && !blocked && !loading}
      saving={saving}
      onSave={() => void onSave()}
    >
      <section className="rounded-xl border bg-muted/30 p-[15px]">
        <div className="flex flex-wrap items-start justify-between gap-[15px]">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
              <Landmark className="size-4" aria-hidden />
            </span>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">Bank connections</h3>
              <p className="text-sm text-muted-foreground">
                Link your bank so new transactions import automatically.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-background"
            onClick={() => openConnectBank(true)}
          >
            <Plus />
            Connect account
          </Button>
        </div>

        <div className="mt-5">
        {accountsQuery.isPending ? (
          <p className="rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
            Loading your connected accounts…
          </p>
        ) : accounts.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
            No accounts connected. Connect one to auto-import transactions.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-background">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center gap-3 p-3 first:rounded-t-md last:rounded-b-md"
              >
                <Landmark
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{account.name}</p>
                  <p className="truncate text-xs text-muted-foreground tabular">
                    {account.account}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDisconnectId(account.id)}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
        </div>
      </section>

      <section className="mt-[15px] rounded-xl border p-[15px]">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40 text-muted-foreground">
            <ReceiptText className="size-4" aria-hidden />
          </span>
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold">
              Your bank details for invoices
            </h3>
            <p className="text-sm text-muted-foreground">
              These appear on every invoice so clients know where to send
              payment. Use the account you want to be paid into.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <BankDetailsFields values={values} patch={patch} />
        </div>
      </section>

      <AlertDialog
        open={disconnectId !== null}
        onOpenChange={(open) => !open && setDisconnectId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this account?</AlertDialogTitle>
            <AlertDialogDescription>
              Sole stops importing transactions from it. Transactions already
              imported stay in your books.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pending && (
            <div className="rounded-md border p-3 text-center">
              <p className="text-sm font-medium">{pending.name}</p>
              <p className="text-xs text-muted-foreground tabular">
                {pending.account}
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={disconnecting}
              onClick={async (e) => {
                // Prevent the AlertDialog from auto-closing on click.
                e.preventDefault();
                if (!disconnectId) return;
                setDisconnecting(true);
                try {
                  await api.post(apiRoutes.bankConnection.disconnect, {
                    accountId: disconnectId,
                  });
                  removeAccount(disconnectId);
                  toast.success("Account disconnected");
                  setDisconnectId(null);
                } catch {
                  toast.error("Couldn't disconnect the account. Try again.");
                } finally {
                  setDisconnecting(false);
                }
              }}
            >
              {disconnecting && <Loader2 className="animate-spin" aria-hidden />}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
