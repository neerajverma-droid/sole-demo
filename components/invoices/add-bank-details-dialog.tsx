"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { useIndustriesQuery } from "@/hooks/use-industries-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  draftFromDetail,
  type BusinessProfileDraft,
} from "@/components/businesses/business-profile-form";
import { fetchBusinessDetail, updateBusinessApi } from "@/lib/businesses";
import { useCountryContext } from "@/hooks/use-country-context";
import { bankAccountField, bankBranchField, bankFieldError, bankFieldHelp } from "@/lib/country-context";
import { cn } from "@/lib/utils";

/**
 * Adding the account clients pay into, without leaving the invoice.
 *
 * What sole-webapp's own inline modal does: an invoice can't be raised
 * without its bank details, and going to Business details and back to add a
 * few fields is the kind of detour that makes someone give up on the
 * invoice entirely. So this asks for exactly those fields, seeded from
 * the business's real record, and saves through the same endpoint the full
 * Business details form uses — nothing here is a local stand-in for it.
 */
export function AddBankDetailsDialog({
  open,
  onOpenChange,
  businessId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
}) {
  const queryClient = useQueryClient();
  const { country } = useCountryContext();
  const industriesQuery = useIndustriesQuery();

  // The same query the full edit screen reads — sharing its cache means a
  // business already opened there loads here instantly, and a save from
  // either place invalidates the same key.
  const detailQuery = useQuery({
    queryKey: ["business", businessId],
    queryFn: () => fetchBusinessDetail(businessId),
    enabled: open,
  });

  const [detail, setDetail] = React.useState<BusinessProfileDraft | null>(
    null,
  );
  const [bankName, setBankName] = React.useState("");
  const [accountHolder, setAccountHolder] = React.useState("");
  const [bsb, setBsb] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const hydrated = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      hydrated.current = false;
      setSubmitted(false);
      return;
    }
    if (hydrated.current || !detailQuery.data || !industriesQuery.data) return;
    hydrated.current = true;

    const draft = draftFromDetail(detailQuery.data, industriesQuery.data);
    setDetail(draft);
    setBankName(draft.bankName);
    setAccountHolder(draft.accountHolder);
    setBsb(draft.bsb);
    setAccountNumber(draft.accountNumber);
  }, [open, detailQuery.data, industriesQuery.data]);

  // Which fields a client pays into depends on the country: a BSB and an
  // account number in Australia, a branch code and one in South Africa, and a
  // single account number in New Zealand, which carries both inside it.
  const branch = bankBranchField(country);
  const account = bankAccountField(country);

  const branchIssue = branch
    ? (bankFieldError(country, branch.key, bsb) ??
      (!bsb.trim() ? `${branch.label} is required.` : undefined))
    : undefined;
  const accountLabel = account?.label ?? "Account number";
  const accountIssue =
    bankFieldError(country, "account_number", accountNumber) ??
    (!accountNumber.trim() ? `${accountLabel} is required.` : undefined);
  // Required because the "Before your first invoice" gate (`hasBankDetails`)
  // requires them: saving without either would close this dialog onto a gate
  // that still says the bank details are missing.
  const holderIssue = !accountHolder.trim() ? "Account name is required." : undefined;
  const bankNameIssue = !bankName.trim() ? "Bank name is required." : undefined;
  const blocked = !!branchIssue || !!accountIssue || !!holderIssue || !!bankNameIssue;
  const issueFor = (issue: string | undefined) => (submitted ? issue : undefined);

  const loading = detailQuery.isLoading || industriesQuery.isLoading || !detail;

  const save = async () => {
    setSubmitted(true);
    if (blocked || !detail) return;

    setSaving(true);
    try {
      const industryId = industriesQuery.data?.find(
        (entry) => entry.name === detail.industry,
      );
      await updateBusinessApi(
        businessId,
        { ...detail, bankName, accountHolder, bsb, accountNumber },
        industryId ? Number(industryId.id) : null,
      );
      // Both keys matter: the invoice editor reads the businesses list
      // (`useActiveBusiness`), and a later visit to Business details reads
      // this business's own cached detail.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["businesses"] }),
        queryClient.invalidateQueries({ queryKey: ["business", businessId] }),
      ]);
      toast.success("Bank details saved");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't save those bank details. Try again."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add your bank details</DialogTitle>
          <DialogDescription>
            Printed on every invoice so clients know where to send payment.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <Field label="Account name" required error={issueFor(holderIssue)}>
              <Input
                value={accountHolder}
                onChange={(event) => setAccountHolder(event.target.value)}
                placeholder="Your business name"
                aria-invalid={!!issueFor(holderIssue)}
                className={cn(
                  issueFor(holderIssue) &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </Field>

            <div className={cn("grid gap-4", branch && "sm:grid-cols-2")}>
              {branch ? (
                <Field
                  label={branch.label}
                  required
                  error={issueFor(branchIssue)}
                  hint={bankFieldHelp(country, branch.key) ?? undefined}
                >
                  <Input
                    value={bsb}
                    inputMode="numeric"
                    placeholder={branch.mask?.replace(/9/g, "0") ?? undefined}
                    onChange={(event) => setBsb(event.target.value)}
                    aria-invalid={!!issueFor(branchIssue)}
                    className={cn(
                      "tabular",
                      issueFor(branchIssue) &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                </Field>
              ) : null}

              <Field
                label={accountLabel}
                required
                error={issueFor(accountIssue)}
                hint={bankFieldHelp(country, "account_number") ?? undefined}
              >
                <Input
                  value={accountNumber}
                  inputMode="numeric"
                  placeholder={account?.mask?.replace(/9/g, "0") ?? "12345678"}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  aria-invalid={!!issueFor(accountIssue)}
                  className={cn(
                    "tabular",
                    issueFor(accountIssue) &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
              </Field>
            </div>

            <Field label="Bank name" required error={issueFor(bankNameIssue)}>
              <Input
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                placeholder="Your bank"
                aria-invalid={!!issueFor(bankNameIssue)}
                className={cn(
                  issueFor(bankNameIssue) &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? "Saving…" : "Save bank details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
