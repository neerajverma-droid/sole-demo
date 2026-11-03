"use client";

import * as React from "react";
import { Check, Loader2, MapPinned, PencilLine, Route } from "lucide-react";

import { useGoogleMapsReady } from "@/components/documents/address-autocomplete";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useKmFormat } from "@/hooks/use-km-tracker-query";
import type { KmRules } from "@/lib/km-tracker";
import { cn } from "@/lib/utils";

const MAPS_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_PLACE_API ||
  "";

/**
 * Where trips can be: the business's country, from the KM rules — its centre
 * (where the map sits before there's a route), the bounds it can't be panned
 * off and a route's ends must fall inside, the Directions region bias and the
 * Places restriction. Plus the country's name for the "outside" message and
 * its currency for toll estimates.
 */
export type KmRouteArea = KmRules["map"] & { countryName: string; currency: string };

function latLngBounds(area: KmRouteArea) {
  const [[south, west], [north, east]] = area.bounds;
  return { north, south, west, east };
}

function inArea(point: google.maps.LatLng | null | undefined, area: KmRouteArea): boolean {
  if (!point) return false;
  const { north, south, west, east } = latLngBounds(area);
  return point.lat() <= north && point.lat() >= south && point.lng() >= west && point.lng() <= east;
}

const outsideMessage = (area: KmRouteArea) =>
  `Both places need to be in ${area.countryName || "your business's country"} — pick them from the suggestions.`;
const START_COLOUR = "#10B981";
const END_COLOUR = "#4F46E5";

export type KmRouteOption = {
  index: number;
  label: string;
  distanceKm: number;
  durationSeconds: number;
  /** Estimated from the Routes API, or null when it couldn't say. */
  tollAmount: number | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  /** A straight line between geocoded points, when Directions is refused. */
  approximate: boolean;
};

type RouteState = {
  status: "idle" | "loading" | "ready" | "error";
  routes: KmRouteOption[];
  /** The Directions result behind `routes`, for the renderer. */
  result: google.maps.DirectionsResult | null;
  message: string;
};

/**
 * Google reports a bad key through `gm_authFailure` (wired up in the root
 * layout) only once the SDK makes its first real request — after the script
 * has loaded and `useGoogleMapsReady` has stopped looking. Watched here for a
 * while longer so the map can step aside instead of showing Google's own
 * "Something went wrong" panel.
 */
function useMapsAuthFailed(active: boolean): boolean {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (!active) return;
    let elapsed = 0;
    const timer = window.setInterval(() => {
      elapsed += 500;
      if ((window as { __googleMapsAuthError?: string }).__googleMapsAuthError) {
        setFailed(true);
        window.clearInterval(timer);
      } else if (elapsed >= 20_000) {
        window.clearInterval(timer);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [active]);
  return failed;
}

const IDLE: RouteState = { status: "idle", routes: [], result: null, message: "" };

function haversineKm(a: google.maps.LatLng, b: google.maps.LatLng): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat() - a.lat());
  const dLng = toRad(b.lng() - a.lng());
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat())) * Math.cos(toRad(b.lat())) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const round7 = (value: number) => Number(value.toFixed(7));

function routeMetrics(route: google.maps.DirectionsRoute) {
  return (route.legs ?? []).reduce(
    (totals, leg) => ({
      meters: totals.meters + (leg.distance?.value ?? 0),
      seconds: totals.seconds + (leg.duration?.value ?? 0),
    }),
    { meters: 0, seconds: 0 },
  );
}

type TollPrice = { currencyCode?: string; units?: string; nanos?: number };
type TollRoute = {
  distanceMeters?: number;
  travelAdvisory?: { tollInfo?: { estimatedPrice?: TollPrice[] } };
};

function tollFrom(route: TollRoute, currency: string): number {
  const prices = route.travelAdvisory?.tollInfo?.estimatedPrice ?? [];
  const price = prices.find((entry) => entry.currencyCode === currency) ?? prices[0];
  if (!price) return 0;
  const total = Number(price.units ?? 0) + Number(price.nanos ?? 0) / 1e9;
  return Number.isFinite(total) ? total : 0;
}

/**
 * Toll estimates for each Directions alternative, from the Routes API — what
 * sole-webapp's `fetchRouteTolls` does. The two APIs don't return their
 * alternatives in a shared order, so each Directions route takes the Routes
 * result closest to it in distance (`matchTollRoutesToDirectionsRoutes`).
 * Best effort: any failure just leaves the tolls unknown.
 */
async function fetchTolls(
  routes: google.maps.DirectionsRoute[],
  origin: google.maps.LatLng,
  destination: google.maps.LatLng,
  currency: string,
  signal: AbortSignal,
): Promise<(number | null)[]> {
  if (!MAPS_KEY) return routes.map(() => null);
  const waypoint = (point: google.maps.LatLng) => ({
    location: { latLng: { latitude: point.lat(), longitude: point.lng() } },
  });
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.travelAdvisory.tollInfo",
      },
      body: JSON.stringify({
        origin: waypoint(origin),
        destination: waypoint(destination),
        travelMode: "DRIVE",
        computeAlternativeRoutes: true,
        extraComputations: ["TOLLS"],
      }),
    },
  );
  if (!response.ok) throw new Error(`Routes API ${response.status}`);
  const payload = (await response.json()) as { routes?: TollRoute[] };
  const remaining = [...(payload.routes ?? [])];
  if (remaining.length === 0) return routes.map(() => null);
  if (remaining.length === routes.length) {
    return remaining.map((route) => tollFrom(route, currency));
  }

  return routes.map((route) => {
    if (remaining.length === 0) return null;
    const meters = routeMetrics(route).meters;
    let best = 0;
    remaining.forEach((candidate, index) => {
      const score = Math.abs((candidate.distanceMeters ?? 0) - meters);
      const bestScore = Math.abs((remaining[best].distanceMeters ?? 0) - meters);
      if (score < bestScore) best = index;
    });
    const [match] = remaining.splice(best, 1);
    return match ? tollFrom(match, currency) : null;
  });
}

/**
 * Driving routes between two addresses, with alternatives and their tolls.
 *
 * Asks only once both ends are filled and typing has paused — sole-webapp
 * re-requested directions on every keystroke in either field. When the key
 * isn't allowed Directions (`REQUEST_DENIED`) it falls back to geocoding both
 * ends and offering the straight-line distance, flagged as approximate, the
 * same fallback sole-webapp drew.
 */
export function useKmRoutes(
  origin: string,
  destination: string,
  area: KmRouteArea,
): RouteState & {
  mapsReady: boolean;
  mapsError: string | null;
  area: KmRouteArea;
} {
  const { ready: scriptReady, error: scriptError } = useGoogleMapsReady();
  const authFailed = useMapsAuthFailed(scriptReady);
  const ready = scriptReady && !authFailed;
  const mapsError = authFailed
    ? "Google Maps isn't available (its key was rejected)."
    : scriptError;
  const from = useDebouncedValue(origin.trim(), 600);
  const to = useDebouncedValue(destination.trim(), 600);
  const [state, setState] = React.useState<RouteState>(IDLE);

  // The area by value, so a fresh object with the same country doesn't re-ask.
  const areaKey = JSON.stringify(area);
  const stableArea = React.useMemo<KmRouteArea>(
    () => JSON.parse(areaKey) as KmRouteArea,
    [areaKey],
  );

  React.useEffect(() => {
    const area = stableArea;
    if (!ready || !from || !to) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading", message: "" }));

    const service = new google.maps.DirectionsService();
    service.route(
      {
        origin: from,
        destination: to,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
        region: area.region,
      },
      (result, status) => {
        if (cancelled) return;

        if (status === google.maps.DirectionsStatus.OK && result?.routes.length) {
          // A typed (not picked) address can still resolve abroad.
          const firstLeg = result.routes[0].legs[0];
          const lastLeg = result.routes[0].legs[result.routes[0].legs.length - 1];
          if (!inArea(firstLeg?.start_location, area) || !inArea(lastLeg?.end_location, area)) {
            setState({ ...IDLE, status: "error", message: outsideMessage(area) });
            return;
          }
          const routes: KmRouteOption[] = result.routes.map((route, index) => {
            const { meters, seconds } = routeMetrics(route);
            const leg = route.legs[0];
            const last = route.legs[route.legs.length - 1];
            return {
              index,
              label: route.summary?.trim() || `Route ${index + 1}`,
              distanceKm: meters / 1000,
              durationSeconds: seconds,
              tollAmount: null,
              startLat: leg?.start_location ? round7(leg.start_location.lat()) : null,
              startLng: leg?.start_location ? round7(leg.start_location.lng()) : null,
              endLat: last?.end_location ? round7(last.end_location.lat()) : null,
              endLng: last?.end_location ? round7(last.end_location.lng()) : null,
              approximate: false,
            };
          });
          setState({ status: "ready", routes, result, message: "" });

          const leg = result.routes[0].legs[0];
          const last = result.routes[0].legs[result.routes[0].legs.length - 1];
          if (leg?.start_location && last?.end_location) {
            fetchTolls(
              result.routes,
              leg.start_location,
              last.end_location,
              area.currency,
              controller.signal,
            )
              .then((tolls) => {
                if (cancelled) return;
                setState((current) => ({
                  ...current,
                  routes: current.routes.map((route, index) => ({
                    ...route,
                    tollAmount: tolls[index] ?? null,
                  })),
                }));
              })
              .catch(() => {
                if (cancelled) return;
                setState((current) => ({
                  ...current,
                  message: "Toll estimates couldn't be fetched — add any tolls yourself.",
                }));
              });
          }
          return;
        }

        if (status === google.maps.DirectionsStatus.REQUEST_DENIED) {
          const geocoder = new google.maps.Geocoder();
          const geocode = (address: string) =>
            new Promise<google.maps.LatLng | null>((resolve) =>
              geocoder.geocode(
                {
                  address,
                  region: area.region,
                  componentRestrictions: {
                    country: (area.placeRestrictions[0] ?? area.region).toUpperCase(),
                  },
                },
                (results, geoStatus) =>
                resolve(geoStatus === "OK" ? (results?.[0]?.geometry.location ?? null) : null),
              ),
            );
          Promise.all([geocode(from), geocode(to)]).then(([a, b]) => {
            if (cancelled) return;
            if ((a && !inArea(a, area)) || (b && !inArea(b, area))) {
              setState({ ...IDLE, status: "error", message: outsideMessage(area) });
              return;
            }
            if (!a || !b) {
              setState({
                ...IDLE,
                status: "error",
                message: "Couldn't find one of those places on the map — enter the distance yourself.",
              });
              return;
            }
            setState({
              status: "ready",
              result: null,
              message:
                "Driving directions aren't available, so this is the straight-line distance — check it against your odometer.",
              routes: [
                {
                  index: 0,
                  label: "Straight line (estimate)",
                  distanceKm: haversineKm(a, b),
                  durationSeconds: 0,
                  tollAmount: null,
                  startLat: round7(a.lat()),
                  startLng: round7(a.lng()),
                  endLat: round7(b.lat()),
                  endLng: round7(b.lng()),
                  approximate: true,
                },
              ],
            });
          });
          return;
        }

        setState({
          ...IDLE,
          status: "error",
          message:
            status === google.maps.DirectionsStatus.ZERO_RESULTS
              ? "No driving route found between these places — enter the distance yourself."
              : "Couldn't work out a route right now — enter the distance yourself.",
        });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ready, from, to, stableArea]);

  return { ...state, mapsReady: ready, mapsError, area: stableArea };
}

/**
 * The map and the route chooser. Picking a route hands its distance, times
 * and coordinates to the form; "Enter distance myself" hands control of the
 * distance field back — for a trip that took a detour no suggestion knows.
 */
export function KmRouteMap({
  routes,
  result,
  status,
  message,
  mapsReady,
  mapsError,
  area,
  selectedIndex,
  manual,
  onSelectRoute,
  onManual,
}: ReturnType<typeof useKmRoutes> & {
  selectedIndex: number;
  manual: boolean;
  onSelectRoute: (route: KmRouteOption) => void;
  onManual: () => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const rendererRef = React.useRef<google.maps.DirectionsRenderer | null>(null);
  const overlaysRef = React.useRef<(google.maps.Marker | google.maps.Polyline)[]>([]);
  const format = useKmFormat();
  const center = React.useMemo(
    () => ({ lat: area.center[0], lng: area.center[1] }),
    [area.center],
  );

  // One map per mount.
  React.useEffect(() => {
    if (!mapsReady || !containerRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(containerRef.current, {
      center,
      zoom: 4,
      restriction: { latLngBounds: latLngBounds(area), strictBounds: false },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      styles: [
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
      ],
    });
    rendererRef.current = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: END_COLOUR, strokeWeight: 5, strokeOpacity: 0.85 },
    });
    // One map per mount — a later change of area (a business switch) remounts the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsReady]);

  // Draw whichever route is chosen.
  React.useEffect(() => {
    const map = mapRef.current;
    const renderer = rendererRef.current;
    if (!map || !renderer) return;

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    const route = routes[Math.min(selectedIndex, routes.length - 1)];
    if (!route || route.startLat === null || route.startLng === null || route.endLat === null || route.endLng === null) {
      renderer.setMap(null);
      map.setCenter(center);
      map.setZoom(4);
      return;
    }

    const start = { lat: route.startLat, lng: route.startLng };
    const end = { lat: route.endLat, lng: route.endLng };
    const pin = (colour: string) => ({
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: colour,
      fillOpacity: 1,
      strokeColor: "#FFFFFF",
      strokeWeight: 2,
      scale: 8,
    });

    if (result && !route.approximate) {
      renderer.setMap(map);
      renderer.setDirections(result);
      renderer.setRouteIndex(route.index);
    } else {
      renderer.setMap(null);
      overlaysRef.current.push(
        new google.maps.Polyline({
          map,
          path: [start, end],
          geodesic: true,
          strokeColor: END_COLOUR,
          strokeOpacity: 0.8,
          strokeWeight: 4,
        }),
      );
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(start);
      bounds.extend(end);
      map.fitBounds(bounds, 48);
    }
    overlaysRef.current.push(
      new google.maps.Marker({ map, position: start, icon: pin(START_COLOUR), title: "Start" }),
      new google.maps.Marker({ map, position: end, icon: pin(END_COLOUR), title: "End" }),
    );
  }, [routes, result, selectedIndex, center]);

  React.useEffect(
    () => () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      rendererRef.current?.setMap(null);
    },
    [],
  );

  const unavailable = !mapsReady && !!mapsError;

  return (
    <div className="space-y-3">
      <div className="relative h-64 overflow-hidden rounded-md border border-border bg-muted/40 md:h-80">
        <div ref={containerRef} className={cn("absolute inset-0", unavailable && "hidden")} />
        {(!mapsReady || routes.length === 0) && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
            <div className="space-y-2 text-sm text-muted-foreground">
              {status === "loading" ? (
                <Loader2 className="mx-auto size-6 animate-spin" aria-hidden />
              ) : (
                <MapPinned className="mx-auto size-7 opacity-60" aria-hidden />
              )}
              <p>
                {unavailable
                  ? "The map isn't available right now. You can still enter the distance yourself."
                  : status === "loading"
                    ? "Finding routes…"
                    : !mapsReady
                      ? "Loading map…"
                      : "Add a start and end location to see the route."}
              </p>
            </div>
          </div>
        )}
      </div>

      {message && (
        <p className="text-xs text-warning" role="status">
          {message}
        </p>
      )}

      {(routes.length > 0 || status === "error" || unavailable) && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Route className="size-4 text-primary" aria-hidden />
            Choose a route
          </p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Route">
            {routes.map((route) => {
              const active = !manual && route.index === selectedIndex;
              return (
                <RouteChoice
                  key={route.index}
                  active={active}
                  onClick={() => onSelectRoute(route)}
                  title={route.label}
                  detail={[
                    `${format.km(route.distanceKm)} km`,
                    route.durationSeconds > 0 ? formatSeconds(route.durationSeconds) : "",
                    route.tollAmount ? `${format.money(route.tollAmount)} toll` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              );
            })}
            <RouteChoice
              active={manual}
              onClick={onManual}
              title="Enter distance myself"
              detail="For a detour, or when no route is found."
              icon={<PencilLine className="size-4 text-muted-foreground" aria-hidden />}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function formatSeconds(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function RouteChoice({
  active,
  onClick,
  title,
  detail,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary/[0.06]"
          : "border-border bg-card hover:border-foreground/20",
      )}
    >
      <span className="flex min-w-0 gap-2">
        {icon}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{detail}</span>
        </span>
      </span>
      {active && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}
