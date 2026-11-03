"use client";

import * as React from "react";
import { Info, Lock, Plus, Trash2 } from "lucide-react";

import { DatePicker } from "@/components/documents/date-picker";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import {
  emptyKmVehicle,
  kmNeedsVehicleType,
  kmTracksYearEndOdometer,
  kmVehicleIssues,
  kmVehicleLabel,
  type KmOdometerReading,
  type KmRules,
  type KmVehicle,
  type KmVehicleTextKey,
} from "@/lib/km-tracker";
import { cn } from "@/lib/utils";

/**
 * Add or edit one vehicle. The change lands in the settings draft, not on the
 * server — the footer says so, because the settings page saves as a whole.
 * Validation is sole-webapp's `validateSingleVehicle`, shown per field once
 * touched and all at once on submit.
 *
 * Where the country's rate depends on the kind of vehicle (New Zealand), a
 * vehicle type replaces the free-text fuel type, and the kilometre rate's
 * year-end odometer readings are kept here too.
 */
export function KmVehicleDialog({
  open,
  vehicle,
  rules,
  otherLabels,
  odometerLocked,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  /** The vehicle being edited, or null to add one. */
  vehicle: KmVehicle | null;
  rules: KmRules;
  /** Every other vehicle's name, for the duplicate check. */
  otherLabels: string[];
  /** Logbook trips already exist for it in the logbook period. */
  odometerLocked: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (vehicle: KmVehicle) => void;
}) {
  const [draft, setDraft] = React.useState<KmVehicle>(emptyKmVehicle);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = React.useState(false);

  // Fresh values each time it opens.
  React.useEffect(() => {
    if (!open) return;
    setDraft(vehicle ?? emptyKmVehicle());
    setTouched({});
    setAttempted(false);
  }, [open, vehicle]);

  const typed = kmNeedsVehicleType(rules);
  const yearEndReadings = kmTracksYearEndOdometer(rules);
  const selectedType = rules.vehicleTypes?.find((type) => type.key === draft.vehicleType);

  const issues = kmVehicleIssues(draft, otherLabels, rules);
  const issueFor = (key: keyof KmVehicle) =>
    attempted || touched[key] ? issues.find((issue) => issue.key === key)?.message : undefined;

  const set = (key: KmVehicleTextKey) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setTouched((current) => ({ ...current, [key]: true }));
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setReadings = (next: KmOdometerReading[]) => {
    setTouched((current) => ({ ...current, odometerReadings: true }));
    setDraft((current) => ({ ...current, odometerReadings: next }));
  };

  const renamed =
    !!vehicle &&
    kmVehicleLabel(vehicle) !== "" &&
    kmVehicleLabel(vehicle) !== kmVehicleLabel(draft);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (issues.length > 0) return;
    onSave({
      ...draft,
      // A new vehicle starts its running reading where its logbook starts,
      // as sole-ocr's `sanitizeVehicleDetails` would anyway.
      currentOdometer: draft.currentOdometer || draft.logbookStartOdometer,
    });
  };

  const text = (
    key: KmVehicleTextKey,
    label: string,
    placeholder: string,
    extra?: Partial<React.ComponentProps<typeof Input>>,
  ) => (
    <Field label={label} htmlFor={`km-vehicle-${key}`} required error={issueFor(key)}>
      <Input
        id={`km-vehicle-${key}`}
        value={draft[key]}
        onChange={set(key)}
        placeholder={placeholder}
        aria-invalid={!!issueFor(key)}
        className={cn(issueFor(key) && "border-destructive focus-visible:ring-destructive")}
        {...extra}
      />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{vehicle ? `Edit ${kmVehicleLabel(vehicle) || "vehicle"}` : "Add vehicle"}</DialogTitle>
            <DialogDescription>
              {rules.rates.maxKm !== null
                ? "Trips are logged against a vehicle — it carries the logbook odometer and the annual cents-per-km cap."
                : "Trips are logged against a vehicle — it carries the logbook odometer and its year's total kilometres."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {text("nickname", "Name", "Work ute", { autoFocus: true })}
            {text("registrationNumber", "Registration number", "ABC123")}
            {text("make", "Make", "Toyota")}
            {text("model", "Model", "Hilux")}
            {text("year", "Year", "2024", { inputMode: "numeric", maxLength: 4 })}
            {typed ? (
              <Field
                label="Vehicle type"
                htmlFor="km-vehicle-vehicleType"
                required
                error={issueFor("vehicleType")}
                hint={
                  selectedType && !selectedType.statutory
                    ? "Not covered by the kilometre rate — trips in this vehicle claim actual costs."
                    : undefined
                }
              >
                <Select
                  value={draft.vehicleType || undefined}
                  onValueChange={(vehicleType) => {
                    setTouched((current) => ({ ...current, vehicleType: true }));
                    setDraft((current) => ({ ...current, vehicleType }));
                  }}
                >
                  <SelectTrigger
                    id="km-vehicle-vehicleType"
                    aria-invalid={!!issueFor("vehicleType")}
                    className={cn(issueFor("vehicleType") && "border-destructive focus-visible:ring-destructive")}
                  >
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(rules.vehicleTypes ?? []).map((type) => (
                      <SelectItem key={type.key} value={type.key}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              text("fuelType", "Fuel type", "Petrol, diesel, EV")
            )}
            {text("engineCapacity", "Engine capacity", "2.8L")}
            <Field
              label="Logbook start odometer"
              htmlFor="km-vehicle-logbookStartOdometer"
              required
              error={issueFor("logbookStartOdometer")}
              hint={
                odometerLocked
                  ? undefined
                  : "The reading on the day your logbook began. New logbook trips start from the latest reading."
              }
            >
              <Input
                id="km-vehicle-logbookStartOdometer"
                inputMode="decimal"
                value={draft.logbookStartOdometer}
                onChange={set("logbookStartOdometer")}
                placeholder="12000.0"
                disabled={odometerLocked}
                aria-invalid={!!issueFor("logbookStartOdometer")}
                className={cn(
                  "tabular",
                  issueFor("logbookStartOdometer") && "border-destructive focus-visible:ring-destructive",
                )}
              />
              {odometerLocked && (
                <p className="flex items-start gap-1.5 text-xs text-warning">
                  <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
                  Locked — logbook trips already exist for this vehicle in your logbook period.
                </p>
              )}
            </Field>
            <Field
              label="Current odometer"
              htmlFor="km-vehicle-current"
              hint="Kept up to date from your latest logbook trip."
            >
              <Input
                id="km-vehicle-current"
                value={draft.currentOdometer}
                readOnly
                tabIndex={-1}
                placeholder="Set from the logbook start"
                className="bg-muted/40 tabular text-muted-foreground"
              />
            </Field>
            {yearEndReadings && (
              <div className="sm:col-span-2">
                <YearEndReadings
                  readings={draft.odometerReadings}
                  defaultDate={rules.incomeYear?.endDate ?? ""}
                  error={issueFor("odometerReadings")}
                  onChange={setReadings}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <Field label="Notes" htmlFor="km-vehicle-notes">
                <Textarea
                  id="km-vehicle-notes"
                  rows={2}
                  value={draft.notes}
                  onChange={set("notes")}
                  placeholder="Optional"
                />
              </Field>
            </div>
          </div>

          {renamed && (
            <p className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Trips already logged against “{kmVehicleLabel(vehicle as KmVehicle)}” keep that
              name, so they won&apos;t count towards this vehicle&apos;s totals under its new one.
            </p>
          )}

          <DialogFooter className="mt-6 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Applied when you save settings.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">{vehicle ? "Update vehicle" : "Add vehicle"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The odometer at each income year's end — what the kilometre rate's tiers
 * are counted from (the vehicle's whole year, not only its business trips).
 * A new row starts on the current year's end date.
 */
function YearEndReadings({
  readings,
  defaultDate,
  error,
  onChange,
}: {
  readings: KmOdometerReading[];
  defaultDate: string;
  error?: string;
  onChange: (readings: KmOdometerReading[]) => void;
}) {
  const update = (index: number, values: Partial<KmOdometerReading>) =>
    onChange(readings.map((entry, position) => (position === index ? { ...entry, ...values } : entry)));

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Odometer at year end</p>
          <p className="text-xs text-muted-foreground">
            Record the reading on the last day of each income year. It shows when the vehicle
            passed the tier 1 limit.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onChange([...readings, { date: defaultDate, reading: "" }])}
        >
          <Plus />
          Add reading
        </Button>
      </div>
      {readings.length > 0 && (
        <ul className="space-y-2">
          {readings.map((entry, index) => (
            <li key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
              <DatePicker
                value={entry.date}
                onChange={(iso) => update(index, { date: iso })}
                label={`Reading ${index + 1} date`}
              />
              <Input
                inputMode="decimal"
                value={entry.reading}
                onChange={(event) => update(index, { reading: event.target.value })}
                placeholder="Reading (km)"
                aria-label={`Reading ${index + 1} odometer`}
                className="tabular"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                aria-label={`Remove reading ${index + 1}`}
                onClick={() => onChange(readings.filter((_, position) => position !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
