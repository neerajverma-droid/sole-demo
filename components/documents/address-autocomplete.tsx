"use client";

import * as React from "react";
import { Loader2, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const DEFAULT_COUNTRY_RESTRICTIONS = ["au", "nz"];

/**
 * Whether `google.maps.places` is ready, polled rather than checked once.
 *
 * The Maps script is `beforeInteractive` in the root layout, but that's a
 * guarantee about injection order, not about the external fetch finishing by
 * the time this component's own mount effect runs — and `gm_authFailure`
 * (wired up next to that script tag) can also fire well after the script has
 * loaded, once the SDK's first real request comes back rejected. A one-shot
 * check at mount silently and permanently treats either case as "no
 * suggestions, ever" with nothing on screen to say why. This polls instead,
 * and surfaces the auth failure specifically rather than swallowing it.
 */
export function useGoogleMapsReady(): { ready: boolean; error: string | null } {
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let elapsed = 0;
    const intervalMs = 200;
    const timeoutMs = 15_000;

    const tick = () => {
      if (cancelled) return;

      const authError = (window as { __googleMapsAuthError?: string })
        .__googleMapsAuthError;
      if (authError) {
        setError(authError);
        return;
      }
      if (typeof google !== "undefined" && google.maps?.places) {
        setReady(true);
        return;
      }

      elapsed += intervalMs;
      if (elapsed >= timeoutMs) {
        setError(
          "Address search didn't load — check your connection, or use the fields below.",
        );
        return;
      }
      window.setTimeout(tick, intervalMs);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, error };
}

export type AddressComponents = {
  addressLine1: string;
  country: string;
  city: string;
  state: string;
  postcode: string;
};

/**
 * Splits a Google Place result into the fields this form's address section
 * collects. Same reading as sole-webapp's `handleAddressSelect`
 * (components/Contacts/AddManualContact.js) — street number + route for line
 * one, falling back to the typed description's first segment when a place
 * has neither; postcode digits-only.
 */
function componentsFromPlace(
  place: google.maps.places.PlaceResult,
  fallbackDescription: string,
): AddressComponents {
  const parts = place.address_components ?? [];
  const long = (type: string) =>
    parts.find((component) => component.types.includes(type))?.long_name ?? "";
  const short = (type: string) =>
    parts.find((component) => component.types.includes(type))?.short_name ?? "";

  const streetNumber = long("street_number");
  const route = long("route");
  const addressLine1 =
    streetNumber && route
      ? `${streetNumber} ${route}`
      : route || fallbackDescription.split(",")[0] || "";

  return {
    addressLine1,
    country: long("country"),
    city: long("locality"),
    state: short("administrative_area_level_1"),
    postcode: long("postal_code").replace(/\D/g, ""),
  };
}

/**
 * A live Google Places search — a drop-in for a plain text input, not a
 * button-trigger combobox: it looks and behaves like the input it replaces
 * until two characters in, when real suggestions appear below it.
 *
 * Rebuilt against the Google Places `AutocompleteService` /
 * `PlacesService` APIs sole-webapp's own address autocomplete uses
 * (components/ui/address-autocomplete.jsx) — read for the logic, not
 * imported, per the brief. Picking a suggestion reports both the full
 * formatted string (`onChange`, so the field shows what was chosen) and its
 * parsed components (`onSelect`, to fill address line 1 / country / city /
 * state / postcode) — the same two-callback split that file uses.
 */
export function AddressAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  ariaInvalid,
  countryRestrictions = DEFAULT_COUNTRY_RESTRICTIONS,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: AddressComponents) => void;
  placeholder?: string;
  className?: string;
  ariaInvalid?: boolean;
  /** Same AU/NZ default sole-webapp's contact form applies. Pass `null` for none. */
  countryRestrictions?: string[] | null;
}) {
  const [suggestions, setSuggestions] = React.useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const autocompleteService =
    React.useRef<google.maps.places.AutocompleteService | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { ready: mapsReady, error: mapsError } = useGoogleMapsReady();

  React.useEffect(() => {
    if (mapsReady) {
      autocompleteService.current =
        new google.maps.places.AutocompleteService();
    }
  }, [mapsReady]);

  // There's no trigger button to toggle this shut, so an outside click is
  // what closes it instead — same as it would if this were a native listbox.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const fetchSuggestions = (input: string) => {
    if (input.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (!autocompleteService.current) return;

    setLoading(true);
    autocompleteService.current.getPlacePredictions(
      {
        input,
        ...(countryRestrictions?.length
          ? { componentRestrictions: { country: countryRestrictions } }
          : {}),
      },
      (predictions, status) => {
        setLoading(false);
        if (
          status === google.maps.places.PlacesServiceStatus.OK &&
          predictions
        ) {
          setSuggestions(predictions);
          setOpen(true);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      },
    );
  };

  const handlePick = (
    prediction: google.maps.places.AutocompletePrediction,
  ) => {
    setOpen(false);
    setSuggestions([]);
    onChange(prediction.description);

    if (typeof google === "undefined" || !google.maps?.places) return;
    const service = new google.maps.places.PlacesService(
      document.createElement("div"),
    );
    service.getDetails({ placeId: prediction.place_id }, (place, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && place) {
        onSelect(componentsFromPlace(place, prediction.description));
      }
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          aria-invalid={ariaInvalid}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value);
            fetchSuggestions(event.target.value);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          className={className}
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </div>

      {/* Surfaced rather than swallowed — a referrer-restricted or invalid
          key otherwise fails the same way as no suggestions matching, and
          nothing on screen says which one happened. */}
      {mapsError && (
        <p className="mt-1.5 text-xs text-muted-foreground">{mapsError}</p>
      )}

      {open && suggestions.length > 0 && (
        <div
          className={cn(
            "absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md",
          )}
        >
          <Command shouldFilter={false}>
            <CommandList>
              <CommandGroup>
                {suggestions.map((suggestion) => (
                  <CommandItem
                    key={suggestion.place_id}
                    value={suggestion.place_id}
                    onSelect={() => handlePick(suggestion)}
                    className="gap-2"
                  >
                    <MapPin
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="truncate text-sm">
                      {suggestion.description}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
