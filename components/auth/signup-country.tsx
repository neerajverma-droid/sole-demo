"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCountriesQuery,
  useDetectedCountryQuery,
} from "@/hooks/use-countries-query";
import { countryByIso2 } from "@/lib/countries";

/**
 * The country a new account's business starts in.
 *
 * `iso2` is the person's pick, else where we think they are (IP, then
 * timezone), and only a country on the live list: that is what the backend would
 * accept anyway. It is null while loading, when detection fails or when nothing
 * live matches, and then nothing is sent and the backend decides as before.
 *
 * A guess is never silent: the register screen shows it and lets it be changed.
 * Onboarding still confirms it, and it stays changeable until the first
 * transaction.
 */
export function useSignupCountry(preferredIso2?: string | null) {
  const { data: countries = [] } = useCountriesQuery();
  const { data: detectedIso2 } = useDetectedCountryQuery();
  const [chosen, setChosen] = React.useState<string | null>(null);

  // Order: the person's pick, then one handed to us (an accountant's invite names the
  // client's country), then where we think they are.
  const country =
    countryByIso2(countries, chosen) ??
    countryByIso2(countries, preferredIso2) ??
    countryByIso2(countries, detectedIso2);

  return {
    countries,
    country,
    iso2: country?.iso2 ?? null,
    choose: setChosen,
  };
}

export function SignupCountryLine({
  signupCountry,
  disabled,
}: {
  signupCountry: ReturnType<typeof useSignupCountry>;
  disabled?: boolean;
}) {
  const { countries, country, choose } = signupCountry;
  const [editing, setEditing] = React.useState(false);

  // Nothing to say until we know a country, and nothing to pick from with one.
  if (!country || countries.length < 2) return null;

  if (editing) {
    return (
      <div className="space-y-1.5">
        <label htmlFor="signup-country" className="text-sm font-medium">
          Your country
        </label>
        <Select
          value={country.iso2}
          disabled={disabled}
          onValueChange={(value) => {
            choose(value);
            setEditing(false);
          }}
        >
          <SelectTrigger id="signup-country" className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {countries.map((item) => (
              <SelectItem key={item.iso2} value={item.iso2}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <p className="text-center text-sm text-muted-foreground">
      Your country:{" "}
      <span className="font-medium text-foreground">{country.name}</span>{" "}
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={disabled}
        className="rounded font-medium underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        (change)
      </button>
    </p>
  );
}
