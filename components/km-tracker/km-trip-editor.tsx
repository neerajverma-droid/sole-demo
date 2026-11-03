"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calculator,
  ClipboardList,
  Loader2,
  MapPinned,
  RotateCcw,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUnsavedChanges } from "@/components/ui/unsaved-changes";
import { AddressAutocomplete } from "@/components/documents/address-autocomplete";
import { BusinessContactSelect } from "@/components/documents/business-contact-select";
import { Field } from "@/components/documents/field";
import { MoneyInput } from "@/components/planner/money-input";
import {
  KmRouteMap,
  useKmRoutes,
  type KmRouteOption,
} from "@/components/km-tracker/km-route-map";
import { useAddressRules } from "@/hooks/use-address-rules";
import {
  useCreateKmTripMutation,
  useKmFormat,
  useKmRules,
  useKmSettingsQuery,
  useKmStatsQuery,
  useKmTripQuery,
  useUpdateKmTripMutation,
} from "@/hooks/use-km-tracker-query";
import { fetchBusinessContacts } from "@/lib/clients";
import {
  DEFAULT_KM_FILTERS,
  KM_CAP_WARNING_KM,
  addSecondsToDateTimeLocal,
  clamp,
  emptyKmTripDraft,
  fetchKmProjectJobs,
  fetchKmProjects,
  findKmVehicle,
  fromDateTimeLocal,
  isStatutoryKmMethod,
  kmApiErrorMessage,
  kmMethodFor,
  kmReasonLabel,
  kmTags,
  kmTierRates,
  kmTripDraftFromTrip,
  kmTripFigures,
  kmTripIssues,
  kmTripNeedsOdometer,
  kmTripPayload,
  kmTripRate,
  kmVehicleLabel,
  kmVehicleOdometer,
  reasonOptionsFor,
  toDateTimeLocal,
  trimNumber,
  type KmCalculationMethod,
  type KmSettings,
  type KmTrip,
  type KmTripDraft,
} from "@/lib/km-tracker";
import { cn } from "@/lib/utils";

const KM_ROOT = "/km-tracker";
const CUSTOM_REASON = "__custom__";
const NONE = "none";

type Mode = "create" | "edit" | "duplicate";

/**
 * Create, edit or duplicate a trip — the route page shell around the form.
 * It waits for what the form is seeded from (the account's KM settings, and
 * the trip itself when editing or duplicating), so the form only ever mounts
 * once with real values rather than re-seeding under someone's typing.
 */
export function KmTripEditor({
  tripId,
  duplicateId,
}: {
  /** Editing this trip. */
  tripId?: string;
  /** Starting a new trip from a copy of this one. */
  duplicateId?: string;
}) {
  const mode: Mode = tripId ? "edit" : duplicateId ? "duplicate" : "create";
  const settingsQuery = useKmSettingsQuery();
  const sourceQuery = useKmTripQuery(tripId ?? duplicateId);
  // The form's method and odometer fields follow the country's rules, so it
  // mounts once they've answered (or failed, leaving Australia's).
  const { loading: rulesLoading } = useKmRules();

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href={KM_ROOT}>
        <ArrowLeft />
        KM Tracker
      </Link>
    </Button>
  );

  if (
    settingsQuery.isLoading ||
    rulesLoading ||
    ((tripId || duplicateId) && sourceQuery.isLoading)
  ) {
    return (
      <div className="space-y-6" aria-hidden>
        <Shimmer className="h-8 w-48 rounded-md" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Shimmer className="h-[520px] w-full rounded-lg border border-border" />
          <Shimmer className="h-[520px] w-full rounded-lg border border-border" />
        </div>
      </div>
    );
  }

  if (settingsQuery.isError || ((tripId || duplicateId) && sourceQuery.isError)) {
    const missingTrip = sourceQuery.isError;
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">
            {missingTrip ? "That trip couldn't be loaded" : "Couldn't load your KM settings"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {missingTrip
              ? "It may have been deleted since this link was made."
              : "Check your connection and try again."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => (missingTrip ? sourceQuery.refetch() : settingsQuery.refetch())}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const settings = settingsQuery.data as KmSettings;

  if (!settings.isSetupComplete) {
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Settings2 className="mx-auto size-7 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">Add a vehicle before logging trips</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Trips are recorded against a vehicle, so KM Tracker needs at least one
            in settings first.
          </p>
          <Button size="sm" className="mt-4" asChild>
            <Link href={`${KM_ROOT}/settings`}>Go to settings</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <KmTripForm
      key={sourceQuery.data?.id ?? "new"}
      mode={mode}
      settings={settings}
      source={sourceQuery.data}
    />
  );
}

/** The form's starting values for each mode. */
function initialDraft(mode: Mode, settings: KmSettings, source?: KmTrip): KmTripDraft {
  if (!source || mode === "create") return emptyKmTripDraft(settings);
  const draft = kmTripDraftFromTrip(source);
  if (mode === "edit") return draft;

  // A copy is a fresh trip: today, same length of time, and odometer readings
  // that follow the vehicle rather than the original's.
  const start = new Date();
  const original =
    (fromDateTimeLocal(draft.endTime)?.getTime() ?? 0) -
    (fromDateTimeLocal(draft.startTime)?.getTime() ?? 0);
  return {
    ...draft,
    startTime: toDateTimeLocal(start),
    endTime: toDateTimeLocal(new Date(start.getTime() + Math.max(0, original))),
    odometerStart: "",
    odometerEnd: "",
    vehicle: findKmVehicle(settings.vehicles, draft.vehicle)
      ? draft.vehicle
      : emptyKmTripDraft(settings).vehicle,
  };
}

function KmTripForm({
  mode,
  settings,
  source,
}: {
  mode: Mode;
  settings: KmSettings;
  source?: KmTrip;
}) {
  const router = useRouter();
  const isNew = mode !== "edit";
  const createTrip = useCreateKmTripMutation();
  const updateTrip = useUpdateKmTripMutation();
  const saving = createTrip.isPending || updateTrip.isPending;
  const format = useKmFormat();
  const { restrictions } = useAddressRules();

  const [initial] = React.useState(() => initialDraft(mode, settings, source));
  const [draft, setDraft] = React.useState<KmTripDraft>(initial);

  // The rules for the trip's own date: its income year's rate, not today's.
  const { rules, ready: rulesReady } = useKmRules(draft.startTime.slice(0, 10) || undefined);
  const placeRestrictions = rules.map.placeRestrictions.length
    ? rules.map.placeRestrictions
    : restrictions;

  /* What the trip is claimed under: its own method when editing, otherwise
     the account's current one — sole-webapp's `nextCalculationMethod` — as
     this country names it. */
  const method: KmCalculationMethod =
    mode === "edit" && source?.calculationMethod
      ? source.calculationMethod
      : kmMethodFor(rules, settings.calculationMethod);
  const statutory = isStatutoryKmMethod(method);
  const cents = method === "cents_per_kilometre";
  const tiered = method === "kilometre_rate";
  const needsOdometer = kmTripNeedsOdometer(rules, method);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = React.useState(false);
  const [customReason, setCustomReason] = React.useState(
    () =>
      !!initial.reason &&
      !reasonOptionsFor(initial.tripType).some((option) => option.value === initial.reason),
  );
  const [splitUnit, setSplitUnit] = React.useState<"percent" | "km">("percent");
  const [splitKmText, setSplitKmText] = React.useState("");

  /** End time follows start + route duration until someone sets it by hand. */
  const [endAuto, setEndAuto] = React.useState(isNew);
  const distanceRef = React.useRef<HTMLInputElement>(null);

  const patch = (key: string, values: Partial<KmTripDraft>) => {
    setTouched((current) => (current[key] ? current : { ...current, [key]: true }));
    setDraft((current) => ({ ...current, ...values }));
  };

  const dirty = React.useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initial),
    [draft, initial],
  );
  const [saved, setSaved] = React.useState(false);
  const { guardNavigate, dialog: unsavedDialog } = useUnsavedChanges(dirty && !saved);

  /* ---------------------------------------------------------------- *
   * Routes
   * ---------------------------------------------------------------- */

  const routeState = useKmRoutes(draft.startLocation, draft.endLocation, {
    ...rules.map,
    countryName: rules.countryName || format.country.name,
    currency: format.country.currency,
  });
  const [selectedRoute, setSelectedRoute] = React.useState(0);
  const [manualDistance, setManualDistance] = React.useState(!isNew);
  /** The distance the chosen route suggested, for "Restore". */
  const [suggestedKm, setSuggestedKm] = React.useState<number | null>(null);

  const applyRoute = (route: KmRouteOption, withDistance: boolean) => {
      setDraft((current) => {
        const next: KmTripDraft = {
          ...current,
          startLat: route.startLat,
          startLng: route.startLng,
          endLat: route.endLat,
          endLng: route.endLng,
        };
        if (!withDistance) return next;
        next.distanceKm = trimNumber(route.distanceKm);
        if (endAuto && route.durationSeconds > 0) {
          next.endTime = addSecondsToDateTimeLocal(current.startTime, route.durationSeconds);
        }
        // An estimated toll fills an untouched toll field — the same thing
        // sole-webapp did on every route pick for a new trip.
        if (route.tollAmount !== null && !touched.tollAmount) {
          next.tollAmount = route.tollAmount > 0 ? trimNumber(route.tollAmount) : "";
        }
        return next;
      });
      if (withDistance) setSuggestedKm(route.distanceKm);
  };

  // New routes: a new trip takes the selected one's distance; an edited trip
  // only refreshes its coordinates, keeping the distance that was saved.
  React.useEffect(() => {
    if (routeState.status !== "ready" || routeState.routes.length === 0) return;
    const index = Math.min(selectedRoute, routeState.routes.length - 1);
    if (index !== selectedRoute) setSelectedRoute(index);
    applyRoute(routeState.routes[index], isNew && !manualDistance);
    // Only when a new set of routes lands — not on every pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeState.routes, routeState.status]);

  const pickRoute = (route: KmRouteOption) => {
    setManualDistance(false);
    setSelectedRoute(route.index);
    setTouched((current) => ({ ...current, distanceKm: true }));
    applyRoute(route, true);
  };

  const enterManually = () => {
    setManualDistance(true);
    window.setTimeout(() => {
      distanceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      distanceRef.current?.focus();
    }, 50);
  };

  /* ---------------------------------------------------------------- *
   * Vehicle and odometer
   * ---------------------------------------------------------------- */

  const vehicleOptions = React.useMemo(() => {
    const labels = settings.vehicles.map(kmVehicleLabel).filter(Boolean);
    // A trip saved against a vehicle since renamed or removed keeps its name.
    return draft.vehicle && !labels.includes(draft.vehicle)
      ? [...labels, draft.vehicle]
      : labels;
  }, [settings.vehicles, draft.vehicle]);
  const vehicle = findKmVehicle(settings.vehicles, draft.vehicle);
  const ratePerKm = kmTripRate(rules, {
    method,
    settings,
    vehicle,
    savedRate: mode === "edit" ? source?.ratePerKm : undefined,
    rulesReady,
  });
  // The kilometre rate needs a vehicle type the rate covers.
  const vehicleTypeMissing = tiered && !!vehicle && !kmTierRates(rules, vehicle.vehicleType);

  // The logbook's start reading follows the vehicle until it's typed over.
  React.useEffect(() => {
    if (!needsOdometer || mode === "edit" || touched.odometerStart) return;
    const reading = kmVehicleOdometer(vehicle);
    setDraft((current) => {
      const next = reading === null ? "" : trimNumber(reading, 1);
      return current.odometerStart === next ? current : { ...current, odometerStart: next };
    });
  }, [needsOdometer, mode, vehicle, touched.odometerStart]);

  // …and the end reading is always start + distance.
  React.useEffect(() => {
    if (!needsOdometer) return;
    setDraft((current) => {
      const start = Number(current.odometerStart);
      const distance = Number(current.distanceKm);
      const next =
        current.odometerStart.trim() && Number.isFinite(start)
          ? trimNumber(start + (Number.isFinite(distance) && distance > 0 ? distance : 0), 1)
          : "";
      return current.odometerEnd === next ? current : { ...current, odometerEnd: next };
    });
  }, [needsOdometer, draft.odometerStart, draft.distanceKm]);

  /* ---------------------------------------------------------------- *
   * Clients, projects and jobs
   * ---------------------------------------------------------------- */

  const clientsQuery = useQuery({
    queryKey: ["km-clients"],
    queryFn: () => fetchBusinessContacts("Client"),
  });
  const projectsQuery = useQuery({
    queryKey: ["km-projects"],
    queryFn: fetchKmProjects,
  });
  const jobsQuery = useQuery({
    queryKey: ["km-project-jobs", draft.projectId],
    queryFn: () => fetchKmProjectJobs(draft.projectId as string),
    enabled: !!draft.projectId,
  });
  const projects = projectsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];

  // A job that isn't one of the chosen project's goes — sole-webapp's rule.
  React.useEffect(() => {
    if (!jobsQuery.data || !draft.jobId) return;
    if (!jobsQuery.data.some((job) => job.value === draft.jobId)) {
      setDraft((current) => ({ ...current, jobId: null }));
    }
  }, [jobsQuery.data, draft.jobId]);

  /* ---------------------------------------------------------------- *
   * Figures, cap and validation
   * ---------------------------------------------------------------- */

  const figures = kmTripFigures(draft, method, ratePerKm);

  const statsQuery = useKmStatsQuery(DEFAULT_KM_FILTERS);
  const centsSummary = statsQuery.data?.cents;
  const capLimit = centsSummary?.limit ?? settings.centsPerKmLimit ?? rules.rates.maxKm ?? 0;
  const remainingBefore =
    centsSummary?.vehicleClaims.find(
      (claim) => claim.vehicle === (draft.vehicle.trim() || "Unassigned vehicle"),
    )?.remainingClaimableKm ?? capLimit;
  const remainingAfter = remainingBefore - figures.deductibleKm;
  // New trips only, as in sole-webapp; the server checks edits itself. Only
  // where the country caps the rate at all.
  const capApplies = statutory && rules.rates.maxKm !== null && isNew && figures.deductibleKm > 0;
  const overCap = capApplies && remainingAfter < 0;
  const nearCap = capApplies && !overCap && remainingAfter <= KM_CAP_WARNING_KM;

  const issues = kmTripIssues(
    draft,
    {
      method,
      ratePerKm,
      hasVehicles: settings.vehicles.length > 0,
      currencySymbol: format.symbol,
    },
    rules,
  );
  const issueFor = (key: string) =>
    attempted || touched[key] ? issues.find((issue) => issue.key === key)?.message : undefined;
  const invalidClass = (key: string) =>
    issueFor(key) ? "border-destructive focus-visible:ring-destructive" : undefined;

  const onSave = () => {
    setAttempted(true);
    if (saving) return;
    if (issues.length > 0) {
      toast.error(
        issues.length === 1 ? issues[0].message : `${issues.length} fields need attention`,
        { description: issues.length > 1 ? issues[0].message : undefined },
      );
      return;
    }
    if (overCap) {
      toast.error("This trip goes over the annual cents-per-km cap", {
        description: `${format.km(Math.abs(remainingAfter))} KM over the ${format.km(capLimit)} KM limit for this vehicle.`,
      });
      return;
    }

    const payload = kmTripPayload(draft, { method, ratePerKm }, rules);
    const done = () => {
      setSaved(true);
      toast.success(mode === "edit" ? "Trip updated" : "Trip saved", {
        description: `${format.km(figures.distanceKm)} KM · ${kmReasonLabel(draft.reason)}`,
      });
      router.push(KM_ROOT);
    };
    const failed = (error: unknown) =>
      toast.error(kmApiErrorMessage(error, "Couldn't save this trip."));

    if (mode === "edit" && source) {
      updateTrip.mutate({ id: source.id, payload }, { onSuccess: done, onError: failed });
    } else {
      createTrip.mutate(payload, { onSuccess: done, onError: failed });
    }
  };

  /* ---------------------------------------------------------------- *
   * Split
   * ---------------------------------------------------------------- */

  const setSplit = (on: boolean) => {
    const current = clamp(Number(draft.businessPercentage) || 0, 0, 100);
    patch("businessPercentage", {
      isSplit: on,
      businessPercentage: on ? (current > 0 && current < 100 ? draft.businessPercentage : "50") : "100",
      tripType: on ? "business" : draft.tripType,
    });
    setSplitKmText("");
  };

  const onSplitKm = (value: string) => {
    setSplitKmText(value);
    const km = Number(value);
    const pct =
      value.trim() && Number.isFinite(km) && figures.distanceKm > 0
        ? clamp((km / figures.distanceKm) * 100, 0, 100)
        : 0;
    patch("businessPercentage", { businessPercentage: trimNumber(pct, 4) });
  };

  const reasonOptions = reasonOptionsFor(draft.tripType);
  const title =
    mode === "edit" ? "Edit trip" : mode === "duplicate" ? "Duplicate trip" : "Add trip";

  /* ---------------------------------------------------------------- *
   * Layout
   * ---------------------------------------------------------------- */

  const saveButton = (
    <Button onClick={onSave} disabled={saving}>
      {saving && <Loader2 className="animate-spin" />}
      {mode === "edit" ? "Save changes" : "Save trip"}
    </Button>
  );

  return (
    <div className="space-y-6 pb-4">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={guardNavigate(KM_ROOT)}>
          <ArrowLeft />
          KM Tracker
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">
              Record a trip for mileage tracking and tax deductions. Fields marked{" "}
              <span className="text-destructive">*</span> are required.
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <Button variant="ghost" onClick={guardNavigate(KM_ROOT)} disabled={saving}>
              Cancel
            </Button>
            {saveButton}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-6">
          <FormSection
            icon={MapPinned}
            title="Route"
            description="Where and when you drove. Pick a suggested route or enter the distance yourself."
          >
            <div className="grid gap-4 sm:grid-cols-2" data-usertour="km-trip-route">
              <Field label="Start location" htmlFor="km-start" required error={issueFor("startLocation")}>
                <LocationInput tone="start">
                  <AddressAutocomplete
                    id="km-start"
                    value={draft.startLocation}
                    onChange={(value) =>
                      patch("startLocation", {
                        startLocation: value,
                        startLat: null,
                        startLng: null,
                      })
                    }
                    onSelect={() => undefined}
                    countryRestrictions={placeRestrictions}
                    placeholder="Where you set off"
                    ariaInvalid={!!issueFor("startLocation")}
                    className={cn("pl-8", invalidClass("startLocation"))}
                  />
                </LocationInput>
              </Field>
              <Field label="End location" htmlFor="km-end" required error={issueFor("endLocation")}>
                <LocationInput tone="end">
                  <AddressAutocomplete
                    id="km-end"
                    value={draft.endLocation}
                    onChange={(value) =>
                      patch("endLocation", { endLocation: value, endLat: null, endLng: null })
                    }
                    onSelect={() => undefined}
                    countryRestrictions={placeRestrictions}
                    placeholder="Where you arrived"
                    ariaInvalid={!!issueFor("endLocation")}
                    className={cn("pl-8", invalidClass("endLocation"))}
                  />
                </LocationInput>
              </Field>
              <Field label="Start date & time" htmlFor="km-start-time" required error={issueFor("startTime")}>
                <Input
                  id="km-start-time"
                  type="datetime-local"
                  value={draft.startTime}
                  onChange={(event) => {
                    const startTime = event.target.value;
                    const route = routeState.routes[selectedRoute];
                    patch("startTime", {
                      startTime,
                      ...(endAuto && route && !manualDistance && route.durationSeconds > 0
                        ? { endTime: addSecondsToDateTimeLocal(startTime, route.durationSeconds) }
                        : endAuto
                          ? { endTime: startTime }
                          : {}),
                    });
                  }}
                  className={invalidClass("startTime")}
                />
              </Field>
              <Field
                label="End date & time"
                htmlFor="km-end-time"
                required
                error={issueFor("endTime")}
                hint={endAuto ? "Follows the start time and the route's driving time." : undefined}
              >
                <Input
                  id="km-end-time"
                  type="datetime-local"
                  value={draft.endTime}
                  min={draft.startTime || undefined}
                  onChange={(event) => {
                    setEndAuto(false);
                    patch("endTime", { endTime: event.target.value });
                  }}
                  className={invalidClass("endTime")}
                />
              </Field>
            </div>

            <div className="mt-4" data-usertour="km-trip-map">
              <KmRouteMap
                {...routeState}
                selectedIndex={selectedRoute}
                manual={manualDistance}
                onSelectRoute={pickRoute}
                onManual={enterManually}
              />
            </div>
          </FormSection>

          <FormSection
            icon={Calculator}
            title="Distance & costs"
            description={
              cents
                ? "Claimed at the cents-per-km rate. Tolls and parking can be added on top."
                : statutory
                  ? `Claimed at the ${format.method(method).toLowerCase()}. Tolls and parking can be added on top.`
                  : format.method(method) === "Logbook"
                    ? "Logbook trips claim actual costs — add tolls, parking, fuel and running costs."
                    : `${format.method(method)} — add tolls, parking, fuel and running costs.`
            }
            action={
              <Badge variant="secondary" className="whitespace-nowrap">
                {format.method(method)}
              </Badge>
            }
          >
            <div className="space-y-5" data-usertour="km-trip-costs">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Distance (KM)" htmlFor="km-distance" required error={issueFor("distanceKm")}>
                  <div className="flex gap-2">
                    <Input
                      ref={distanceRef}
                      id="km-distance"
                      inputMode="decimal"
                      value={draft.distanceKm}
                      onChange={(event) => {
                        setManualDistance(true);
                        patch("distanceKm", { distanceKm: event.target.value });
                      }}
                      placeholder="0.00"
                      className={cn("tabular", invalidClass("distanceKm"))}
                    />
                    {suggestedKm !== null &&
                      Math.abs(Number(draft.distanceKm) - suggestedKm) > 0.005 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setManualDistance(false);
                            patch("distanceKm", { distanceKm: trimNumber(suggestedKm) });
                          }}
                          title={`Back to the route's ${format.km(suggestedKm)} KM`}
                        >
                          <RotateCcw />
                          Restore
                        </Button>
                      )}
                  </div>
                </Field>
                {statutory && (
                  <Field
                    label={tiered ? "Kilometre rate (tier 1)" : "Rate per KM"}
                    labelTip={rules.copy.rateTooltip || undefined}
                  >
                    <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular text-muted-foreground">
                      {format.money(ratePerKm)} / km
                    </div>
                  </Field>
                )}
              </div>

              {tiered && (
                <div
                  role={vehicleTypeMissing ? "alert" : undefined}
                  className={cn(
                    "flex gap-2 rounded-md border px-3 py-2 text-xs",
                    vehicleTypeMissing
                      ? "border-warning/30 bg-warning/5 text-warning"
                      : "border-border bg-muted/30 text-muted-foreground",
                  )}
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    {vehicleTypeMissing
                      ? `${draft.vehicle || "This vehicle"} has no vehicle type the kilometre rate covers. Set its type in KM Tracker settings, or this trip can't be saved under this method.`
                      : [
                          "An estimate at the tier 1 rate. The tier depends on the vehicle's whole year, so the claim is worked out when you save.",
                          rules.rates.provisional ? rules.copy.provisionalNote : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                  </span>
                </div>
              )}

              {(nearCap || overCap) && (
                <div
                  role="alert"
                  className={cn(
                    "flex gap-2 rounded-md border px-3 py-2 text-sm",
                    overCap
                      ? "border-destructive/30 bg-destructive/5 text-destructive"
                      : "border-warning/30 bg-warning/5 text-warning",
                  )}
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {overCap
                    ? `This trip would take ${draft.vehicle || "this vehicle"} ${format.km(Math.abs(remainingAfter))} KM over the annual ${format.km(capLimit)} KM cents-per-km cap, so it can't be saved under this method.`
                    : `${draft.vehicle || "This vehicle"} is close to the annual ${format.km(capLimit)} KM cap — ${format.km(Math.max(0, remainingAfter))} KM left after this trip.`}
                </div>
              )}

              {needsOdometer && (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Journey odometer readings</p>
                    <p className="text-xs text-muted-foreground">
                      The start follows the selected vehicle&apos;s last reading; the end is
                      the start plus this trip&apos;s distance.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Start odometer"
                      htmlFor="km-odo-start"
                      required
                      error={issueFor("odometerStart")}
                      hint={!vehicle ? "No reading on file for this vehicle — enter it from the dashboard." : undefined}
                    >
                      <Input
                        id="km-odo-start"
                        inputMode="decimal"
                        value={draft.odometerStart}
                        onChange={(event) =>
                          patch("odometerStart", { odometerStart: event.target.value })
                        }
                        className={cn("tabular", invalidClass("odometerStart"))}
                      />
                    </Field>
                    <Field label="End odometer" htmlFor="km-odo-end" error={issueFor("odometerEnd")}>
                      <Input
                        id="km-odo-end"
                        value={draft.odometerEnd}
                        readOnly
                        tabIndex={-1}
                        placeholder="Start + distance"
                        className="bg-muted/40 tabular text-muted-foreground"
                      />
                    </Field>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-sm font-medium">
                  {statutory ? "Additional expenses" : "Expenses"}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ExpenseField
                    label="Toll"
                    value={draft.tollAmount}
                    error={issueFor("tollAmount")}
                    split={draft.isSplit ? draft.splitToll : null}
                    symbol={format.symbol}
                    onChange={(tollAmount) => patch("tollAmount", { tollAmount })}
                    onSplit={(splitToll) => patch("splitToll", { splitToll })}
                    hint={
                      routeState.routes[selectedRoute]?.tollAmount && !manualDistance
                        ? "Estimated from the route — adjust if you paid something different."
                        : undefined
                    }
                  />
                  <ExpenseField
                    label="Parking"
                    value={draft.parkingAmount}
                    error={issueFor("parkingAmount")}
                    split={draft.isSplit ? draft.splitParking : null}
                    symbol={format.symbol}
                    onChange={(parkingAmount) => patch("parkingAmount", { parkingAmount })}
                    onSplit={(splitParking) => patch("splitParking", { splitParking })}
                  />
                  {!statutory && (
                    <>
                      <ExpenseField
                        label="Fuel cost"
                        value={draft.fuelCost}
                        error={issueFor("fuelCost")}
                        split={draft.isSplit ? draft.splitFuel : null}
                        symbol={format.symbol}
                        onChange={(fuelCost) => patch("fuelCost", { fuelCost })}
                        onSplit={(splitFuel) => patch("splitFuel", { splitFuel })}
                      />
                      <ExpenseField
                        label="Other expenses"
                        value={draft.otherExpenses}
                        error={issueFor("otherExpenses")}
                        split={draft.isSplit ? draft.splitOther : null}
                        symbol={format.symbol}
                        onChange={(otherExpenses) => patch("otherExpenses", { otherExpenses })}
                        onSplit={(splitOther) => patch("splitOther", { splitOther })}
                      />
                    </>
                  )}
                </div>
                {cents && (
                  <p className="text-xs text-muted-foreground">
                    Fuel and other running costs aren&apos;t claimable separately under
                    cents per km — the rate already covers them.
                  </p>
                )}
                {statutory && !cents && (
                  <p className="text-xs text-muted-foreground">
                    Fuel and other running costs aren&apos;t claimable separately under
                    the {format.method(method).toLowerCase()} — the rate already covers them.
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="km-split" className="text-sm font-medium">
                      Split this trip
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Part business, part personal — only the business share is claimed.
                    </p>
                  </div>
                  <Switch id="km-split" checked={draft.isSplit} onCheckedChange={setSplit} />
                </div>
                {draft.isSplit && (
                  <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Field
                      label="Business share"
                      htmlFor="km-split-value"
                      error={issueFor("businessPercentage")}
                    >
                      <div className="flex gap-2">
                        <Input
                          id="km-split-value"
                          inputMode="decimal"
                          value={
                            splitUnit === "percent"
                              ? draft.businessPercentage
                              : splitKmText || trimNumber(figures.deductibleKm)
                          }
                          onChange={(event) =>
                            splitUnit === "percent"
                              ? patch("businessPercentage", { businessPercentage: event.target.value })
                              : onSplitKm(event.target.value)
                          }
                          className={cn("tabular", invalidClass("businessPercentage"))}
                        />
                        <ToggleGroup
                          type="single"
                          variant="outline"
                          value={splitUnit}
                          onValueChange={(value) => {
                            if (!value) return;
                            setSplitUnit(value as "percent" | "km");
                            setSplitKmText("");
                          }}
                          aria-label="Enter the business share as"
                        >
                          <ToggleGroupItem value="percent" className="px-3">%</ToggleGroupItem>
                          <ToggleGroupItem value="km" className="px-3">KM</ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    </Field>
                    <dl className="flex gap-4 rounded-md bg-muted/40 px-3 py-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Business</dt>
                        <dd className="font-medium tabular">{format.km(figures.deductibleKm)} KM</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Personal</dt>
                        <dd className="font-medium tabular">{format.km(figures.personalKm)} KM</dd>
                      </div>
                    </dl>
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Each expense has its own Split switch — turn it off for a cost that was
                      wholly for business.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </FormSection>
        </div>

        <div className="min-w-0 space-y-6 lg:sticky lg:top-4">
          <FormSection icon={ClipboardList} title="Trip details">
            <div className="space-y-4" data-usertour="km-trip-details">
              <Field label="Reason" htmlFor="km-reason" required error={issueFor("reason")}>
                <Select
                  value={customReason ? CUSTOM_REASON : draft.reason || undefined}
                  onValueChange={(value) => {
                    if (value === CUSTOM_REASON) {
                      setCustomReason(true);
                      patch("reason", { reason: "" });
                      return;
                    }
                    setCustomReason(false);
                    patch("reason", { reason: value });
                  }}
                >
                  <SelectTrigger
                    id="km-reason"
                    aria-invalid={!!issueFor("reason")}
                    className={invalidClass("reason")}
                  >
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasonOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_REASON}>Something else…</SelectItem>
                  </SelectContent>
                </Select>
                {customReason && (
                  <Input
                    autoFocus
                    value={draft.reason}
                    onChange={(event) => patch("reason", { reason: event.target.value })}
                    placeholder="Describe the reason"
                    aria-label="Custom reason"
                    className={cn("mt-2", invalidClass("reason"))}
                  />
                )}
              </Field>

              <Field label="Vehicle" htmlFor="km-vehicle" required error={issueFor("vehicle")}>
                <Select
                  value={draft.vehicle || undefined}
                  onValueChange={(value) => patch("vehicle", { vehicle: value })}
                >
                  <SelectTrigger id="km-vehicle" className={invalidClass("vehicle")}>
                    <SelectValue placeholder="Select a vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleOptions.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* <Link
                  href={`${KM_ROOT}/settings?tab=vehicles`}
                  className="mt-1.5 inline-block text-xs text-primary underline-offset-4 hover:underline"
                >
                  Manage vehicles
                </Link> */}
              </Field>

              <div className="space-y-1.5">
                <BusinessContactSelect
                  type="Client"
                  required={false}
                  contacts={clientsQuery.data ?? []}
                  loading={clientsQuery.isLoading}
                  loadError={clientsQuery.isError ? "Couldn't load clients." : undefined}
                  onRetry={() => clientsQuery.refetch()}
                  contactId={draft.clientId}
                  contactName={draft.clientName}
                  onSelect={({ contactId, contactName }) =>
                    patch("client", { clientId: contactId, clientName: contactName })
                  }
                  onContactsChanged={() => clientsQuery.refetch()}
                />
                {/* Clearing a saved trip's client can't be sent: the encrypted
                    body has no way to say "null" to a BIGINT column. */}
                {draft.clientId && !(mode === "edit" && source?.clientId) && (
                  <button
                    type="button"
                    onClick={() => patch("client", { clientId: null, clientName: "" })}
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Clear client
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Field label="Project" htmlFor="km-project">
                  <Select
                    value={draft.projectId ?? NONE}
                    onValueChange={(value) =>
                      patch("project", { projectId: value === NONE ? null : value, jobId: null })
                    }
                    disabled={projectsQuery.isLoading}
                  >
                    <SelectTrigger id="km-project">
                      <SelectValue placeholder={projectsQuery.isLoading ? "Loading…" : "None"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.value} value={project.value}>
                          {project.label}
                        </SelectItem>
                      ))}
                      {draft.projectId &&
                        !projects.some((project) => project.value === draft.projectId) && (
                          <SelectItem value={draft.projectId}>
                            {source?.projectName || "Current project"}
                          </SelectItem>
                        )}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Job" htmlFor="km-job">
                  <Select
                    value={draft.jobId ?? NONE}
                    onValueChange={(value) => patch("job", { jobId: value === NONE ? null : value })}
                    disabled={!draft.projectId || jobsQuery.isLoading}
                  >
                    <SelectTrigger id="km-job">
                      <SelectValue
                        placeholder={
                          !draft.projectId
                            ? "Pick a project first"
                            : jobsQuery.isLoading
                              ? "Loading jobs…"
                              : "None"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {jobs.map((job) => (
                        <SelectItem key={job.value} value={job.value}>
                          {job.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="km-billable" className="text-sm font-medium">
                    Billable trip
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {draft.isBillable
                      ? "Can be converted to an invoice from the trip list."
                      : "Tracked for tax only. Turn on to bill a client for it."}
                  </p>
                </div>
                <Switch
                  id="km-billable"
                  checked={draft.isBillable}
                  onCheckedChange={(isBillable) => patch("isBillable", { isBillable })}
                />
              </div>

              <Field label="Tags" htmlFor="km-tags" hint="Separate tags with commas.">
                <Input
                  id="km-tags"
                  value={draft.tags}
                  onChange={(event) => patch("tags", { tags: event.target.value })}
                  placeholder="urgent, client-meet"
                />
                {kmTags(draft.tags).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {kmTags(draft.tags).map((tag, index) => (
                      <Badge key={`${tag}-${index}`} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="Notes" htmlFor="km-notes">
                <Textarea
                  id="km-notes"
                  rows={3}
                  value={draft.notes}
                  onChange={(event) => patch("notes", { notes: event.target.value })}
                  placeholder="Anything worth remembering about this trip"
                />
              </Field>
            </div>
          </FormSection>

          <section
            aria-label="Trip summary"
            data-usertour="km-trip-summary"
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <h2 className="text-sm font-semibold">Summary</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <SummaryRow label="Distance" value={`${format.km(figures.distanceKm)} KM`} />
              {draft.isSplit && (
                <SummaryRow label="Business distance" value={`${format.km(figures.deductibleKm)} KM`} />
              )}
              {draft.isSplit && (
                <>
                  <SummaryRow
                    label="Personal share"
                    value={format.money(Math.max(0, figures.totalAmount - figures.estimatedDeduction))}
                  />
                  <SummaryRow label="Business share" value={format.money(figures.estimatedDeduction)} />
                </>
              )}
              <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
                <dt className="font-medium">Total cost</dt>
                <dd className="text-lg font-semibold tabular">{format.money(figures.totalAmount)}</dd>
              </div>
              <SummaryRow
                label="Estimated deduction"
                value={format.money(figures.estimatedDeduction)}
              />
            </dl>
            {tiered && (
              <p className="mt-2 text-xs text-muted-foreground">
                Estimated at the tier 1 rate — the final figure is worked out when you save.
              </p>
            )}
            {issueFor("totalAmount") && (
              <p className="mt-2 text-xs text-destructive">{issueFor("totalAmount")}</p>
            )}
            <div className="mt-4 hidden lg:block">
              <Button className="w-full" onClick={onSave} disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {mode === "edit" ? "Save changes" : "Save trip"}
              </Button>
            </div>
          </section>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {attempted && issues.length > 0 && (
          <p className="mr-auto text-xs text-destructive">
            {issues.length === 1 ? issues[0].message : `${issues.length} fields need attention`}
          </p>
        )}
        <Button variant="ghost" onClick={guardNavigate(KM_ROOT)} disabled={saving}>
          Cancel
        </Button>
        {saveButton}
      </div>

      {unsavedDialog}
    </div>
  );
}

function LocationInput({
  tone,
  children,
}: {
  tone: "start" | "end";
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span
        className={cn(
          "pointer-events-none absolute left-3 top-[18px] z-10 size-2.5 -translate-y-1/2 rounded-full ring-2 ring-background",
          tone === "start" ? "bg-success" : "bg-primary",
        )}
        aria-hidden
      />
      {children}
    </div>
  );
}

function ExpenseField({
  label,
  value,
  error,
  hint,
  split,
  symbol,
  onChange,
  onSplit,
}: {
  label: string;
  value: string;
  error?: string;
  hint?: string;
  /** The country's currency symbol — "$" in Australia. */
  symbol: string;
  /** The per-expense split switch, or null when the trip isn't split. */
  split: boolean | null;
  onChange: (value: string) => void;
  onSplit: (value: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        {split !== null && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Split
            <Switch
              checked={split}
              onCheckedChange={onSplit}
              aria-label={`Split ${label.toLowerCase()} by the business share`}
              className="scale-75"
            />
          </label>
        )}
      </div>
      <MoneyInput
        value={value}
        onChange={onChange}
        label={label}
        invalid={!!error}
        placeholder="0.00"
        prefix={symbol}
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
