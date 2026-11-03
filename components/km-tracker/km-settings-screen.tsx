"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calculator,
  Car,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUnsavedChanges } from "@/components/ui/unsaved-changes";
import { Field } from "@/components/documents/field";
import { KmVehicleDialog } from "@/components/km-tracker/km-vehicle-dialog";
import {
  useKmFormat,
  useKmRules,
  useKmSettingsQuery,
  useSaveKmSettingsMutation,
  type KmFormat,
} from "@/hooks/use-km-tracker-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  DEFAULT_KM_FILTERS,
  KM_BUSINESS_USE_BASES,
  applyKmSettingsDraft,
  fetchKmTripsPage,
  kmExpenseRules,
  kmLogbookMinimumText,
  kmNeedsVehicleType,
  kmSettingsDraft,
  kmSettingsIssues,
  kmVehicleIssues,
  kmVehicleLabel,
  kmVehicleTypeLabel,
  type KmBusinessUseBasis,
  type KmRules,
  type KmSettings,
  type KmSettingsDraft,
} from "@/lib/km-tracker";
import { cn } from "@/lib/utils";

const KM_ROOT = "/km-tracker";
type Tab = "method" | "vehicles";

/**
 * KM Tracker settings: how trips are claimed, and the vehicles they're
 * claimed against.
 *
 * The server keeps both in one record and saves them in one request, so the
 * page edits a single draft and saves it as a whole. That's made obvious
 * rather than left to be discovered: Save and Discard sit in the header and
 * again in a bar that follows the page once anything has changed, each tab
 * marks itself when it holds unsaved edits, and leaving with edits asks first.
 */
export function KmSettingsScreen() {
  const settingsQuery = useKmSettingsQuery();
  // The form seeds its method from the rules, so it waits for them too; a
  // failed fetch falls back to Australia's rather than holding the page.
  const { rules, loading: rulesLoading } = useKmRules();

  if (settingsQuery.isLoading || rulesLoading) {
    return (
      <div className="space-y-[15px]" aria-hidden>
        <Shimmer className="h-8 w-56 rounded-md" />
        <Shimmer className="h-10 w-72 rounded-md" />
        <Shimmer className="h-64 w-full rounded-lg border border-border" />
        <Shimmer className="h-40 w-full rounded-lg border border-border" />
      </div>
    );
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <div className="space-y-4">
        <BackLink onClick={undefined} />
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">Couldn&apos;t load your KM settings</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {apiErrorMessage(settingsQuery.error, "Check your connection and try again.")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => settingsQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return <KmSettingsForm saved={settingsQuery.data} rules={rules} />;
}

function BackLink({ onClick }: { onClick?: () => void }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2"
      onClick={onClick ?? (() => router.push(KM_ROOT))}
    >
      <ArrowLeft />
      KM Tracker
    </Button>
  );
}

function KmSettingsForm({ saved, rules }: { saved: KmSettings; rules: KmRules }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const save = useSaveKmSettingsMutation();
  const format = useKmFormat();

  const [baseline, setBaseline] = React.useState<KmSettingsDraft>(() => kmSettingsDraft(saved, rules));
  const [draft, setDraft] = React.useState<KmSettingsDraft>(baseline);
  const [tab, setTab] = React.useState<Tab>(() =>
    searchParams?.get("tab") === "vehicles" ? "vehicles" : "method",
  );
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = React.useState(false);

  const [vehicleDialog, setVehicleDialog] = React.useState<
    { index: number | null } | null
  >(null);
  const [removing, setRemoving] = React.useState<number | null>(null);

  const methodDirty =
    draft.calculationMethod !== baseline.calculationMethod ||
    draft.ratePerKm !== baseline.ratePerKm ||
    draft.billableRatePerKm !== baseline.billableRatePerKm ||
    draft.businessUseBasis !== baseline.businessUseBasis ||
    draft.businessUsePercentage !== baseline.businessUsePercentage;
  const vehiclesDirty =
    JSON.stringify(draft.vehicles) !== JSON.stringify(baseline.vehicles);
  const dirty = methodDirty || vehiclesDirty;
  const firstSetup = !saved.isSetupComplete;

  const { guardNavigate, dialog: unsavedDialog } = useUnsavedChanges(dirty && !save.isPending);

  const issues = kmSettingsIssues(draft, rules);
  const issueFor = (key: string) =>
    attempted || touched[key] ? issues.find((issue) => issue.key === key)?.message : undefined;
  const vehicleProblems = issues.filter(
    (issue) => issue.key === "vehicles" || issue.key.startsWith("vehicle-"),
  );

  const patch = (key: string, values: Partial<KmSettingsDraft>) => {
    setTouched((current) => ({ ...current, [key]: true }));
    setDraft((current) => ({ ...current, ...values }));
  };

  const discard = () => {
    setDraft(baseline);
    setTouched({});
    setAttempted(false);
  };

  /** Logbook trips inside the saved logbook period lock that vehicle's start
   *  odometer — sole-webapp's `lockedVehicleLabels` check. */
  const periodQuery = useQuery({
    queryKey: ["km-logbook-period-trips", saved.logbookPeriodStart, saved.logbookPeriodEnd],
    queryFn: () =>
      fetchKmTripsPage(
        {
          ...DEFAULT_KM_FILTERS,
          datePreset: "custom",
          customStart: saved.logbookPeriodStart,
          customEnd: saved.logbookPeriodEnd,
        },
        1,
        100,
      ),
    enabled: !!saved.logbookPeriodStart && !!saved.logbookPeriodEnd,
  });
  const lockedLabels = React.useMemo(
    () =>
      new Set(
        (periodQuery.data?.trips ?? [])
          .filter((trip) => trip.calculationMethod === "logbook")
          .map((trip) => trip.vehicle.trim())
          .filter(Boolean),
      ),
    [periodQuery.data],
  );

  const onSave = () => {
    setAttempted(true);
    if (save.isPending) return;
    if (issues.length > 0) {
      const onVehicles = vehicleProblems.length > 0 && issues.every((issue) => vehicleProblems.includes(issue));
      if (onVehicles) setTab("vehicles");
      else if (
        issues.some((issue) =>
          ["ratePerKm", "billableRatePerKm", "businessUsePercentage"].includes(issue.key),
        )
      ) {
        setTab("method");
      }
      toast.error(issues[0].message, {
        description: issues.length > 1 ? `${issues.length - 1} more to fix before saving.` : undefined,
      });
      return;
    }

    save.mutate(applyKmSettingsDraft(saved, draft, rules), {
      onSuccess: (next) => {
        const fresh = kmSettingsDraft(next, rules);
        setBaseline(fresh);
        setDraft(fresh);
        setTouched({});
        setAttempted(false);
        if (firstSetup) {
          toast.success("KM Tracker is ready", {
            description: "Log your first trip whenever you're on the road.",
          });
          router.push(KM_ROOT);
        } else {
          toast.success("Settings saved", {
            description: "New trips will use these settings.",
          });
        }
      },
      onError: (error) =>
        toast.error(apiErrorMessage(error, "Couldn't save KM Tracker settings.")),
    });
  };

  const claimRules = kmExpenseRules(rules, draft.calculationMethod);
  const selectedMethod = rules.methods.find((method) => method.key === draft.calculationMethod);
  const otherLabels = (except: number | null) =>
    draft.vehicles
      .filter((_, index) => index !== except)
      .map(kmVehicleLabel)
      .filter(Boolean);

  const editingVehicle =
    vehicleDialog?.index !== null && vehicleDialog?.index !== undefined
      ? draft.vehicles[vehicleDialog.index]
      : null;

  const actions = (
    <>
      <Button variant="ghost" onClick={discard} disabled={!dirty || save.isPending}>
        Discard changes
      </Button>
      <Button onClick={onSave} disabled={(!dirty && !firstSetup) || save.isPending}>
        {save.isPending && <Loader2 className="animate-spin" />}
        Save settings
      </Button>
    </>
  );

  return (
    <div className="space-y-[15px]">
      <div className="space-y-3">
        <BackLink onClick={guardNavigate(KM_ROOT)} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">KM Tracker settings</h1>
              <SaveState dirty={dirty} saving={save.isPending} />
            </div>
            <p className="text-sm text-muted-foreground">
              How trips are claimed, and the vehicles you log them against. Changes apply
              to new trips — saved trips keep the method they were logged with.
            </p>
          </div>
          {/* <div
            className="flex shrink-0 items-center gap-2"
            data-usertour="km-settings-save-actions"
          >
            {actions}
          </div> */}
        </div>
      </div>

      {firstSetup && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/[0.05] p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">Two steps before your first trip</p>
            <ol className="list-inside list-decimal text-muted-foreground">
              <li>Confirm your calculation method and rates.</li>
              <li>
                Add at least one vehicle — then <strong>Save settings</strong>.
              </li>
            </ol>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="h-auto">
          <TabsTrigger value="method" className="gap-2 py-1.5">
            <Calculator className="size-4" aria-hidden />
            Calculation method
            {methodDirty && <DirtyDot />}
          </TabsTrigger>
          <TabsTrigger
            value="vehicles"
            className="gap-2 py-1.5"
            data-usertour="km-settings-vehicles-tab"
          >
            <Car className="size-4" aria-hidden />
            Vehicles
            <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
              {draft.vehicles.length}
            </Badge>
            {vehiclesDirty && <DirtyDot />}
            {attempted && vehicleProblems.length > 0 && (
              <span className="size-1.5 rounded-full bg-destructive" aria-label="Needs attention" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="method" className="mt-4 space-y-6">
          <FormSection
            icon={Calculator}
            title="Calculation method"
            tourId="km-settings-method"
            description="Choose how vehicle deductions are worked out for new trips."
          >
            <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Calculation method">
              {rules.methods.map((method) => {
                const selected = draft.calculationMethod === method.key;
                const current = baseline.calculationMethod === method.key;
                return (
                  <div
                    key={method.key}
                    className={cn(
                      "relative flex flex-col rounded-lg border p-4 transition-colors",
                      selected ? "border-primary bg-primary/[0.05]" : "border-border hover:border-foreground/20",
                    )}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => patch("calculationMethod", { calculationMethod: method.key })}
                      className="flex items-start gap-3 text-left after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                          selected ? "border-primary" : "border-muted-foreground/50",
                        )}
                        aria-hidden
                      >
                        {selected && <span className="size-2 rounded-full bg-primary" />}
                      </span>
                      <span className="space-y-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          {method.label}
                          {current && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-medium">
                              Current
                            </Badge>
                          )}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {method.description}
                        </span>
                      </span>
                    </button>
                    {method.guidanceUrl && (
                      <a
                        href={method.guidanceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="relative z-10 mt-3 inline-flex items-center gap-1 self-end text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {method.guidanceLabel}
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </FormSection>

          <FormSection
            icon={CircleDot}
            title="Rates"
            tourId="km-settings-rates"
            description="What a kilometre is worth for your tax claim, and what you charge clients for it."
            className="grid gap-4 sm:grid-cols-2"
          >
            {rules.rates.allowCustomRate && (
              <Field
                label={`Rate per KM (${rules.authority} rate)`}
                htmlFor="km-rate"
                required
                error={issueFor("ratePerKm")}
                hint={rules.copy.rateHint || undefined}
              >
                <RateInput
                  id="km-rate"
                  value={draft.ratePerKm}
                  prefix={format.symbol}
                  invalid={!!issueFor("ratePerKm")}
                  onChange={(ratePerKm) => patch("ratePerKm", { ratePerKm })}
                />
              </Field>
            )}
            {rules.rates.byVehicleType && (
              <div className="sm:col-span-2">
                <KmTierRateTable rules={rules} format={format} />
              </div>
            )}
            <Field
              label="Billable rate per KM"
              htmlFor="km-billable-rate"
              required
              error={issueFor("billableRatePerKm")}
              hint={
                Number(draft.billableRatePerKm) > 0
                  ? `Billable trips are invoiced at ${format.money(Number(draft.billableRatePerKm))} per business km.`
                  : rules.rates.allowCustomRate
                    ? "Leave at 0 to invoice billable trips at the rate above."
                    : "Leave at 0 to invoice billable trips at the rate each trip was claimed at."
              }
            >
              <RateInput
                id="km-billable-rate"
                value={draft.billableRatePerKm}
                prefix={format.symbol}
                invalid={!!issueFor("billableRatePerKm")}
                onChange={(billableRatePerKm) => patch("billableRatePerKm", { billableRatePerKm })}
              />
            </Field>
          </FormSection>

          {rules.businessUse.bases && (
            <FormSection
              icon={Car}
              title="Business use"
              description="How you work out the share of the vehicle's use that's for business. It applies to both methods."
              className="grid gap-4 sm:grid-cols-2"
            >
              <Field
                label="How you work out business use"
                htmlFor="km-business-use-basis"
                hint={businessUseHint(rules, draft.businessUseBasis)}
              >
                <Select
                  value={draft.businessUseBasis}
                  onValueChange={(value) =>
                    patch("businessUseBasis", { businessUseBasis: value as KmBusinessUseBasis })
                  }
                >
                  <SelectTrigger id="km-business-use-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rules.businessUse.bases.map((basis) => (
                      <SelectItem key={basis} value={basis}>
                        {businessUseLabel(rules, basis)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {draft.businessUseBasis === "estimate" && (
                <Field
                  label="Business use %"
                  htmlFor="km-business-use"
                  required
                  error={issueFor("businessUsePercentage")}
                  hint={
                    rules.businessUse.noLogbookMaxPct !== null
                      ? `At most ${rules.businessUse.noLogbookMaxPct}% without a logbook.`
                      : undefined
                  }
                >
                  <div className="relative">
                    <Input
                      id="km-business-use"
                      inputMode="decimal"
                      value={draft.businessUsePercentage}
                      onChange={(event) =>
                        patch("businessUsePercentage", { businessUsePercentage: event.target.value })
                      }
                      aria-invalid={!!issueFor("businessUsePercentage")}
                      className={cn(
                        "pr-8 tabular",
                        issueFor("businessUsePercentage") &&
                          "border-destructive focus-visible:ring-destructive",
                      )}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                </Field>
              )}
            </FormSection>
          )}

          <FormSection
            icon={ShieldCheck}
            title="What you can claim"
            description={`The expense rules for ${selectedMethod?.label.toLowerCase()}. They follow the method and can't be changed separately.`}
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <RuleTile label="Tolls" allowed={claimRules.allowTolls} />
              <RuleTile label="Parking" allowed={claimRules.allowParking} />
              <RuleTile label="Fuel" allowed={claimRules.allowFuel} />
              <RuleTile label="Other running costs" allowed={claimRules.allowOther} />
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {claimRules.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </FormSection>
        </TabsContent>

        <TabsContent value="vehicles" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Vehicles</h2>
              <p className="text-sm text-muted-foreground">
                Every trip is logged against one. Additions and edits are kept when you save settings.
              </p>
            </div>
            <Button variant="outline" onClick={() => setVehicleDialog({ index: null })}>
              <Plus />
              Add vehicle
            </Button>
          </div>

          {issueFor("vehicles") && (
            <p className="text-sm text-destructive">{issueFor("vehicles")}</p>
          )}

          {draft.vehicles.length === 0 ? (
            <Empty>
              <EmptyMedia>
                <Car aria-hidden />
              </EmptyMedia>
              <div className="space-y-1">
                <EmptyTitle>No vehicles yet</EmptyTitle>
                <EmptyDescription>
                  Add the car, ute or van you drive for work. Trips can&apos;t be logged
                  until there&apos;s at least one.
                </EmptyDescription>
              </div>
              <EmptyActions>
                <Button size="sm" onClick={() => setVehicleDialog({ index: null })}>
                  <Plus />
                  Add vehicle
                </Button>
              </EmptyActions>
            </Empty>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {draft.vehicles.map((vehicle, index) => {
                const label = kmVehicleLabel(vehicle) || `Vehicle ${index + 1}`;
                const incomplete = kmVehicleIssues(vehicle, [], rules).length > 0;
                const unsaved = !baseline.vehicles.some(
                  (other) => JSON.stringify(other) === JSON.stringify(vehicle),
                );
                return (
                  <li
                    key={`${label}-${index}`}
                    className={cn(
                      "rounded-lg border bg-card p-4 shadow-sm",
                      incomplete && attempted ? "border-destructive/50" : "border-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                          aria-hidden
                        >
                          <Car className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 font-medium">
                            <span className="truncate">{label}</span>
                            {index === 0 && (
                              <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                                Default
                              </Badge>
                            )}
                            {unsaved && (
                              <Badge variant="warning" className="px-1.5 py-0 text-[11px]">
                                Unsaved
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {vehicle.registrationNumber || "No registration"}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Edit ${label}`}
                          onClick={() => setVehicleDialog({ index })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          aria-label={`Remove ${label}`}
                          onClick={() => setRemoving(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <Detail label="Make / model" value={[vehicle.make, vehicle.model].filter(Boolean).join(" ")} />
                      <Detail label="Year" value={vehicle.year} />
                      {kmNeedsVehicleType(rules) ? (
                        <Detail
                          label="Type"
                          value={[kmVehicleTypeLabel(rules, vehicle.vehicleType), vehicle.engineCapacity]
                            .filter(Boolean)
                            .join(" · ")}
                        />
                      ) : (
                        <Detail label="Fuel" value={[vehicle.fuelType, vehicle.engineCapacity].filter(Boolean).join(" · ")} />
                      )}
                      <Detail
                        label="Current odometer"
                        value={vehicle.currentOdometer || vehicle.logbookStartOdometer}
                      />
                    </dl>
                    {incomplete && (
                      <p className="mt-3 text-xs text-destructive">
                        Missing required details —{" "}
                        <button
                          type="button"
                          className="font-medium underline underline-offset-2"
                          onClick={() => setVehicleDialog({ index })}
                        >
                          complete them
                        </button>
                        .
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {draft.vehicles.length > 1 && (
            <p className="text-xs text-muted-foreground">
              The first vehicle is preselected on new trips.
            </p>
          )}
        </TabsContent>
      </Tabs>

      {/* Pinned to the bottom edge while there's something to save — the same
          footer bar the asset screens use — so the actions are never a scroll
          away from the field that was just changed. */}
      {dirty && (
        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          <p className="text-sm">
            <span className="font-medium">Unsaved changes</span>
            <span className="text-muted-foreground">
              {" "}
              — {[methodDirty && "calculation method", vehiclesDirty && "vehicles"]
                .filter(Boolean)
                .join(" and ")}
            </span>
          </p>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}

      <KmVehicleDialog
        open={vehicleDialog !== null}
        vehicle={editingVehicle}
        rules={rules}
        otherLabels={otherLabels(vehicleDialog?.index ?? null)}
        odometerLocked={
          !!editingVehicle &&
          lockedLabels.has(kmVehicleLabel(editingVehicle)) &&
          baseline.vehicles.some((other) => kmVehicleLabel(other) === kmVehicleLabel(editingVehicle))
        }
        onOpenChange={(open) => !open && setVehicleDialog(null)}
        onSave={(vehicle) => {
          const index = vehicleDialog?.index ?? null;
          patch("vehicles", {
            vehicles:
              index === null
                ? [...draft.vehicles, vehicle]
                : draft.vehicles.map((existing, position) => (position === index ? vehicle : existing)),
          });
          setVehicleDialog(null);
          toast(index === null ? "Vehicle added" : "Vehicle updated", {
            description: "Save settings to keep it.",
          });
        }}
      />

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing !== null ? kmVehicleLabel(draft.vehicles[removing]) || "this vehicle" : "vehicle"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Trips already logged against it keep its name. It&apos;s only removed once you
              save settings, and Discard brings it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removing === null) return;
                patch("vehicles", {
                  vehicles: draft.vehicles.filter((_, index) => index !== removing),
                });
                setRemoving(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {unsavedDialog}
    </div>
  );
}

function SaveState({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  if (saving) {
    return (
      <Badge variant="secondary" className="gap-1 font-medium">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Saving…
      </Badge>
    );
  }
  return dirty ? (
    <Badge variant="warning" className="font-medium">
      Unsaved changes
    </Badge>
  ) : (
    <Badge variant="success" className="gap-1 font-medium">
      <CheckCircle2 className="size-3" aria-hidden />
      Saved
    </Badge>
  );
}

function DirtyDot() {
  return <span className="size-1.5 rounded-full bg-warning" aria-label="Unsaved changes" />;
}

function RateInput({
  id,
  value,
  prefix,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  /** The country's currency symbol — "$" in Australia. */
  prefix: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {prefix}
      </span>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        className={cn(
          prefix.length <= 1 ? "pl-7" : prefix.length === 2 ? "pl-9" : "pl-11",
          "pr-12 tabular",
          invalid && "border-destructive focus-visible:ring-destructive",
        )}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        / km
      </span>
    </div>
  );
}

/** "From a 90-day logbook", "An estimate, up to 25% (no logbook)". */
function businessUseLabel(rules: KmRules, basis: KmBusinessUseBasis): string {
  if (basis === "logbook") return `From a logbook kept for ${kmLogbookMinimumText(rules)}`;
  if (basis === "estimate" && rules.businessUse.noLogbookMaxPct !== null) {
    return `An estimate, up to ${rules.businessUse.noLogbookMaxPct}% (no logbook)`;
  }
  return KM_BUSINESS_USE_BASES[basis];
}

function businessUseHint(rules: KmRules, basis: KmBusinessUseBasis): string {
  if (basis === "logbook") {
    return `Your business use comes from the trips in your logbook period. A logbook is good for ${rules.logbook.validYears} years if your use doesn't change much.`;
  }
  if (basis === "estimate") {
    return "Without a logbook you can claim a reasonable estimate, up to the limit.";
  }
  return "Your business use comes from the business and personal trips you log.";
}

/**
 * The kilometre rates, read-only: the authority sets them per vehicle type,
 * two tiers each — tier 1 up to the boundary, tier 2 beyond it. Marked
 * provisional while they're last year's, standing in for this year's.
 */
function KmTierRateTable({ rules, format }: { rules: KmRules; format: KmFormat }) {
  const types = (rules.vehicleTypes ?? []).filter(
    (type) => type.statutory && rules.rates.byVehicleType?.[type.key],
  );
  const boundary = rules.rates.tier1MaxKm;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{rules.copy.rateLabel || "Kilometre rates"}</p>
        {rules.rates.rateYear && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-medium">
            {rules.rates.rateYear} rates
          </Badge>
        )}
        {rules.rates.provisional && (
          <Badge variant="warning" className="px-1.5 py-0 text-[11px] font-medium">
            Provisional
          </Badge>
        )}
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Vehicle type</th>
              <th className="px-3 py-2 text-right font-medium">
                Tier 1{boundary ? ` (first ${format.km(boundary).replace(/\.00$/, "")} km)` : ""}
              </th>
              <th className="px-3 py-2 text-right font-medium">Tier 2</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => {
              const tiers = rules.rates.byVehicleType?.[type.key];
              return (
                <tr key={type.key} className="border-t border-border">
                  <td className="px-3 py-2">{type.label}</td>
                  <td className="px-3 py-2 text-right tabular">
                    {tiers ? `${format.money(tiers.tier1)} / km` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    {tiers ? `${format.money(tiers.tier2)} / km` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(rules.copy.rateHint || rules.copy.provisionalNote) && (
        <p className="text-xs text-muted-foreground">
          {[rules.copy.rateHint, rules.rates.provisional ? rules.copy.provisionalNote : null]
            .filter(Boolean)
            .join(" ")}
        </p>
      )}
    </div>
  );
}

function RuleTile({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
      <span className="text-sm font-medium">{label}</span>
      {allowed ? (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="size-3" aria-hidden />
          Claimable
        </Badge>
      ) : (
        <Badge variant="danger" className="gap-1">
          <XCircle className="size-3" aria-hidden />
          Covered by rate
        </Badge>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate tabular">{value || "—"}</dd>
    </div>
  );
}
