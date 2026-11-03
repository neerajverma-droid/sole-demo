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
import { AddressAutocomplete } from "@/components/documents/address-autocomplete";
import { LockedCountryInput } from "@/components/documents/locked-country-field";
import { useAddressRules } from "@/hooks/use-address-rules";
import { useIndustriesQuery } from "@/hooks/use-industries-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  draftFromDetail,
  type BusinessProfileDraft,
} from "@/components/businesses/business-profile-form";
import { fetchBusinessDetail, updateBusinessApi } from "@/lib/businesses";
import { cn } from "@/lib/utils";

/**
 * Adding the trading address an invoice prints, without leaving the invoice.
 *
 * Structural twin of `AddBankDetailsDialog`: same seed-from-the-real-record,
 * same save through `updateBusinessApi`, same two-query invalidation. Asks
 * for exactly the fields a tax invoice needs — the search box fills all of
 * them at once when a suggestion is picked (`AddressAutocomplete` already
 * does that parsing), and the fields underneath stay editable for when a
 * suggestion isn't quite right or Places has nothing to offer.
 */
export function AddAddressDialog({
  open,
  onOpenChange,
  businessId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
}) {
  const queryClient = useQueryClient();
  const industriesQuery = useIndustriesQuery();
  const rules = useAddressRules();

  // The same query the full edit screen and `AddBankDetailsDialog` read —
  // sharing the cache means a save from any of the three invalidates for all.
  const detailQuery = useQuery({
    queryKey: ["business", businessId],
    queryFn: () => fetchBusinessDetail(businessId),
    enabled: open,
  });

  const [detail, setDetail] = React.useState<BusinessProfileDraft | null>(
    null,
  );
  const [addressSearch, setAddressSearch] = React.useState("");
  const [addressLine1, setAddressLine1] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [postcode, setPostcode] = React.useState("");
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
    setAddressSearch(draft.addressSearch);
    setAddressLine1(draft.addressLine1);
    setCity(draft.city);
    setState(draft.state);
    setPostcode(draft.postcode);
  }, [open, detailQuery.data, industriesQuery.data]);

  const line1Issue = !addressLine1.trim() ? "Address is required." : undefined;
  const postcodeIssue = rules.postcodeError(postcode);
  const blocked = !!line1Issue || !!postcodeIssue;
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
        {
          ...detail,
          addressSearch,
          addressLine1,
          country: rules.countryName,
          city,
          state,
          postcode,
        },
        industryId ? Number(industryId.id) : null,
      );
      // Both keys matter: the invoice editor reads the businesses list
      // (`useActiveBusiness`), and a later visit to Business details reads
      // this business's own cached detail.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["businesses"] }),
        queryClient.invalidateQueries({ queryKey: ["business", businessId] }),
      ]);
      toast.success("Address saved");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't save that address. Try again."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add your business address</DialogTitle>
          <DialogDescription>
            Printed on every invoice — a tax invoice has to carry it.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <Field
              label="Search address"
              htmlFor="invoice-ready-address-search"
              hint="Start typing and pick a match, or fill the fields below."
            >
              <AddressAutocomplete
                id="invoice-ready-address-search"
                value={addressSearch}
                placeholder="Start typing an address"
                countryRestrictions={rules.restrictions}
                onChange={setAddressSearch}
                onSelect={(place) => {
                  const wrongCountry = rules.placeError(place.country);
                  if (wrongCountry) {
                    toast.error(wrongCountry);
                    setAddressSearch("");
                    return;
                  }
                  setAddressLine1(place.addressLine1);
                  setCity(place.city);
                  setState(place.state);
                  setPostcode(place.postcode);
                }}
              />
            </Field>

            <Field
              label="Address line 1"
              htmlFor="invoice-ready-address-line1"
              required
              error={issueFor(line1Issue)}
            >
              <Input
                id="invoice-ready-address-line1"
                value={addressLine1}
                placeholder="Street address"
                aria-invalid={!!issueFor(line1Issue)}
                onChange={(event) => setAddressLine1(event.target.value)}
                className={cn(
                  issueFor(line1Issue) &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" htmlFor="invoice-ready-address-city">
                <Input
                  id="invoice-ready-address-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
              </Field>
              <Field label={rules.regionLabel} htmlFor="invoice-ready-address-state">
                <Input
                  id="invoice-ready-address-state"
                  value={state}
                  list={rules.regionOptions.length ? "invoice-ready-address-regions" : undefined}
                  placeholder={rules.regionOptions[0]}
                  onChange={(event) => setState(event.target.value)}
                />
              </Field>
              <Field
                label={rules.postcodeLabel}
                htmlFor="invoice-ready-address-postcode"
                error={issueFor(postcodeIssue)}
              >
                <Input
                  id="invoice-ready-address-postcode"
                  value={postcode}
                  aria-invalid={!!issueFor(postcodeIssue)}
                  className={cn(
                    issueFor(postcodeIssue) &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  onChange={(event) => setPostcode(event.target.value)}
                />
              </Field>
              <Field label="Country" htmlFor="invoice-ready-address-country">
                <LockedCountryInput
                  id="invoice-ready-address-country"
                  value={rules.countryName}
                />
              </Field>
              <datalist id="invoice-ready-address-regions">
                {rules.regionOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
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
            {saving ? "Saving…" : "Save address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
