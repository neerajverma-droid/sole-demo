"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AuthError } from "@/components/auth/auth-states";
import { useSetCountryStatusMutation } from "@/hooks/use-admin-countries-query";
import { formatCount } from "@/lib/admin/format";
import { registryErrorMessage, COUNTRY_STATUSES, countryStatusPill, type CountryStatus } from "@/lib/admin/countries";

/**
 * Open or close a country for new businesses.
 *
 * Status is the signup gate, not a kill switch: a disabled country stops
 * appearing at sign-up, and every business already keeping books there carries
 * on exactly as before. That distinction is the whole reason this is a dialog
 * with an explanation rather than a dropdown on the page header.
 *
 * The backend refuses to take a never-published country past draft, and
 * refuses live or beta while its rates don't validate, so the failure comes
 * back as a message rather than a silent no-op.
 */
export function CountryStatusDialog({
  iso2,
  country,
  current,
  businesses,
  open,
  onOpenChange,
}: {
  iso2: string;
  country: string;
  current: CountryStatus;
  businesses: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setStatus = useSetCountryStatusMutation(iso2);
  const [next, setNext] = React.useState<CountryStatus>(current);
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setNext(current);
    setServerError(null);
    setStatus.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current]);

  const closing = next === "disabled" && current !== "disabled" && businesses > 0;

  return (
    <AlertDialog open={open} onOpenChange={(value) => !setStatus.isPending && onOpenChange(value)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Who can sign up in {country}?</AlertDialogTitle>
          <AlertDialogDescription>
            Status controls new businesses only. Books that already exist keep working whatever you
            choose here.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <RadioGroup
          value={next}
          onValueChange={(value) => {
            setServerError(null);
            setNext(value as CountryStatus);
          }}
          className="gap-3"
        >
          {COUNTRY_STATUSES.map((status) => {
            const pill = countryStatusPill(status);
            return (
              <div key={status} className="flex items-start gap-2.5">
                <RadioGroupItem value={status} id={`status-${status}`} className="mt-0.5" />
                <div className="min-w-0">
                  <Label htmlFor={`status-${status}`} className="font-medium">
                    {pill.label}
                    {status === current ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">current</span>
                    ) : null}
                  </Label>
                  <p className="text-sm text-muted-foreground">{pill.help}</p>
                </div>
              </div>
            );
          })}
        </RadioGroup>

        {closing ? (
          <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
            {formatCount(businesses)} {businesses === 1 ? "business" : "businesses"} already{" "}
            {businesses === 1 ? "keeps its books" : "keep their books"} in {country}. They are
            unaffected — only new sign-ups are closed.
          </p>
        ) : null}

        {serverError ? <AuthError message={serverError} /> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={setStatus.isPending}>Cancel</AlertDialogCancel>
          <Button
            disabled={setStatus.isPending || next === current}
            onClick={() =>
              setStatus.mutate(next, {
                onSuccess: () => {
                  toast.success(`${country} is now ${countryStatusPill(next).label.toLowerCase()}`);
                  onOpenChange(false);
                },
                onError: (error) =>
                  setServerError(registryErrorMessage(error, "The status couldn't be changed.")),
              })
            }
          >
            {setStatus.isPending ? "Saving…" : "Save status"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
