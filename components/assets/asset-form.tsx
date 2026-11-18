"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Check,
  ExternalLink,
  Eye,
  FileText,
  ImagePlus,
  Images,
  Landmark,
  Link2,
  Loader2,
  Paperclip,
  Percent,
  ReceiptText,
  ScanLine,
  TrendingDown,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FormSection } from "@/components/ui/form-section";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChanges } from "@/components/ui/unsaved-changes";
import { AssetRegistryDialog } from "@/components/assets/asset-registry-dialog";
import {
  AssetFileTile,
  CameraCaptureDialog,
  FilePreviewDialog,
  prefersNativeCamera,
} from "@/components/assets/asset-files";
import { AdvancedAssetsUpsell, useAssetAccess } from "@/components/assets/asset-access";
import { AssetUploadStep } from "@/components/assets/asset-upload-step";
import { RegistryCombobox } from "@/components/assets/registry-combobox";
import { BusinessContactSelect } from "@/components/documents/business-contact-select";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import {
  ASSET_CATEGORIES,
  ASSET_STEP_FIELDS,
  DEPRECIATION_METHODS,
  MAX_DOCUMENTS,
  MAX_DOCUMENT_BYTES,
  TRACKED_CATEGORY,
  UNIT_TYPES,
  assetIssues,
  assetMoney,
  canEditAsset,
  emptyAssetDraft,
  firstIncompleteStep,
  gstBreakdown,
  isSavedAssetFile,
  type AssetCategory,
  type AssetDraft,
  type AssetExtraction,
  type AssetFile,
  type AssetPhotoSlot,
  type DepreciationMethod,
} from "@/lib/assets";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchBusinessContacts } from "@/lib/clients";
import { activeCurrencySymbol, documentTax, formatMoneyIn } from "@/lib/country-context";
import { formatBytes } from "@/lib/expenses";
import { toIsoDate } from "@/lib/invoices";
import {
  AUTOCOMPLETE_MIN_LENGTH,
  fetchServiceAutocomplete,
  type ServiceAutocompleteEntry,
} from "@/lib/service-autocomplete";
import { cn } from "@/lib/utils";
import {
  useAssetRegistryQuery,
  useCreateAssetBrandMutation,
  useCreateAssetTypeMutation,
} from "@/hooks/use-asset-registry-query";
import { useAssetQuery, useSaveAssetMutation } from "@/hooks/use-asset-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { useAssetRegistryStore } from "@/stores/asset-registry";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";

const STEPS = ["Asset", "Details", "Photos", "Depreciation"] as const;

const ASSETS_ROOT = "/assets";

/**
 * New asset, in four steps.
 *
 * Next and a forward Stepper click both hold you on the current step while it
 * still has a required field missing — `goToStep` below is the one place that
 * decides whether a step change goes through. Backward movement (Back, or
 * clicking an earlier step) is never gated: there's nothing to protect by
 * stopping you from revisiting a step you've already filled in. Save Asset
 * still validates the whole draft on top of this and jumps back to the first
 * step carrying an issue, since Next only ever checks the step you're
 * leaving, not ones further ahead you've never visited.
 */
export function AssetForm({
  assetId,
  mode = "manual",
}: {
  assetId?: string;
  /**
   * "upload" swaps step one for document capture. Everything from Details on is
   * the same form — the flows differ in how the first step gets filled in, not
   * in what an asset is.
   */
  mode?: "manual" | "upload";
}) {
  const router = useRouter();
  const registryQuery = useAssetRegistryQuery();
  const assetQuery = useAssetQuery(assetId);
  const editing = assetQuery.data;
  const saveAsset = useSaveAssetMutation();

  const today = toIsoDate(new Date());

  const [draft, setDraft] = React.useState<AssetDraft>(emptyAssetDraft(today));
  const [step, setStep] = React.useState(0);
  const [submitted, setSubmitted] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  /** Saved and on the way out — Save stays off so a second click can't resubmit. */
  const [saved, setSaved] = React.useState(false);

  // The draft starts empty and fills in once the edit target loads.
  React.useEffect(() => {
    if (editing) setDraft(editing);
  }, [editing]);
  /**
   * Whether capture has handed its reading over. Until it has, step one is the
   * upload panel; after, it's the ordinary asset fields carrying what was read
   * — so Back from Details lands on something editable rather than on a
   * drop-zone asking for the document again.
   */
  const [captured, setCaptured] = React.useState(false);

  /** Takes values, or a function of the current draft for async callers. */
  const patch: Patch = (values) => {
    setDirty(true);
    setDraft((current) => ({
      ...current,
      ...(typeof values === "function" ? values(current) : values),
    }));
  };

  const { country } = useCountryContext();
  /*
   * Advanced Assets decides the shape of the form, as on the old AddAssets:
   * with it, all four steps; without it, Asset and Photos only (and only the
   * asset photo slot). Step numbers stay 0–3 so ASSET_STEP_FIELDS still lines
   * up — the hidden steps are skipped, never renumbered.
   */
  const { advanced } = useAssetAccess();
  const visibleSteps = advanced ? [0, 1, 2, 3] : [0, 2];
  const nextVisible = visibleSteps.find((index) => index > step);
  const previousVisible = [...visibleSteps].reverse().find((index) => index < step);
  // The rate on the purchase date, so depreciation figures cap at the ex-GST cost.
  const issues = assetIssues(draft, documentTax(country, draft.purchaseDate).rate, {
    advanced,
  });
  /**
   * A step the user has tried to leave while it still had something missing —
   * tracked separately from `submitted` (the final Save attempt) so a field's
   * error can show as soon as *that step* is left, without lighting up every
   * other step's untouched fields the way a single form-wide flag would.
   */
  const [attemptedSteps, setAttemptedSteps] = React.useState<Set<number>>(
    new Set(),
  );
  const stepOf = (key: string) =>
    ASSET_STEP_FIELDS.findIndex((fields) => fields.includes(key));
  /*
   * Editing an asset whose linked stock item is already tracked: its count is
   * live stock, changed only through Adjust stock or invoices (the backend
   * ignores a count sent from here), and its unit can't change under it.
   */
  const stockTracked = !!assetId && !!editing?.tracked && !!editing?.inventoryProductId;
  const stockOnHand = stockTracked ? Number(editing?.openingStock) || 0 : 0;

  const issueFor = (key: string) =>
    submitted || attemptedSteps.has(stepOf(key))
      ? issues.find((issue) => issue.key === key)?.message
      : undefined;

  /**
   * The gate behind Next and a forward Stepper click: moving back is always
   * allowed, moving onto the same step is a no-op, and moving forward is
   * blocked when the step being left still has one of its own required
   * fields missing — not when a *later* step does, since that one hasn't
   * been seen yet and Next has nothing to say about it.
   */
  /*
   * The asset funnel. Creating only — an edit isn't an asset being added —
   * and each step reported once, so going back and forward again doesn't
   * count the same step twice. Details exists only with Advanced Assets.
   */
  const reportedSteps = React.useRef(new Set<number>());
  const assetTypeProp = () => ({ asset_type: draft.assetType || null });
  const reportStepLeft = (left: number) => {
    if (assetId || reportedSteps.current.has(left)) return;
    if (left === 1) {
      reportedSteps.current.add(left);
      track(EVENTS.ASSET_DETAILS_ADDED, assetTypeProp());
    } else if (left === 2) {
      reportedSteps.current.add(left);
      track(EVENTS.ASSET_PHOTO_UPLOAD_INITIATED, assetTypeProp());
    }
  };

  const goToStep = (next: number) => {
    if (next <= step) {
      setStep(next);
      return;
    }
    const issueKeys = new Set(issues.map((issue) => issue.key));
    if (ASSET_STEP_FIELDS[step]?.some((field) => issueKeys.has(field))) {
      setAttemptedSteps((current) => new Set(current).add(step));
      toast.error("Some details are still missing");
      return;
    }
    reportStepLeft(step);
    setStep(next);
  };

  // Only a successful save switches the guard off — a failed validation or a
  // server error leaves the edits on screen, and still worth protecting.
  const { guardNavigate, dialog } = useUnsavedChanges(dirty);

  const save = async () => {
    if (saving || saved) return;
    setSubmitted(true);
    const incomplete = firstIncompleteStep(issues);
    if (incomplete !== null) {
      setStep(incomplete);
      toast.error("Some details are still missing");
      return;
    }
    setSaving(true);
    try {
      const { documentFailures } = await saveAsset(draft, editing, {
        advanced,
        assetId,
      });
      setDirty(false);
      setSaved(true);
      if (!editing) {
        track(EVENTS.ASSET_ADDED, { ...assetTypeProp(), method: mode });
      }
      if (documentFailures.length > 0) {
        // The asset saved; only some of its documents didn't follow.
        toast.warning(`${draft.name} updated, but some documents didn't save`, {
          description: documentFailures.join("\n"),
        });
      } else {
        toast.success(editing ? `${draft.name} updated` : `${draft.name} added to the register`);
      }
      router.push(ASSETS_ROOT);
    } catch (error) {
      // The server's own reason — e.g. a 409 asking for the match to be undone.
      toast.error(apiErrorMessage(error, "Couldn't save this asset"));
      setSaving(false);
    }
  };

  const isLast = step === visibleSteps[visibleSteps.length - 1];
  const capturing = mode === "upload" && !editing && !captured;

  /** Take a reading: fields onto the draft, document into the asset's files. */
  const applyExtraction = (
    extraction: AssetExtraction,
    file: AssetFile,
    advance: boolean,
  ) => {
    patch((current) => ({
      ...extraction.fields,
      documents: [...current.documents, file],
    }));
    setCaptured(true);
    // Basic plan: no Details step, so the reading stays on step one.
    if (advance) setStep(advanced ? 1 : 0);
  };

  /*
   * Editing: the wizard only ever renders against the loaded asset. While it
   * (or the registry it waits on) loads, a loading line; if either fails, an
   * error with a retry — never the blank create form, which would save a
   * second asset.
   */
  if (assetId) {
    // Only a load that never produced data: a failed background refetch keeps
    // the form (and its edits) on screen.
    const loadError =
      (!registryQuery.data ? registryQuery.error : null) ??
      (!editing ? assetQuery.error : null);
    if (loadError) {
      return (
        <AssetLoadError
          message={apiErrorMessage(loadError, "Couldn't load this asset.")}
          onRetry={() => {
            if (registryQuery.isError) void registryQuery.refetch();
            else void assetQuery.refetch();
          }}
        />
      );
    }
    // A matched copy being refetched (say, straight after an undo) waits for
    // the fresh one rather than flashing the blocked state.
    if (!editing || (!canEditAsset(editing) && assetQuery.isFetching)) {
      return (
        <div className="mx-auto max-w-3xl py-12 text-center text-sm text-muted-foreground">
          Loading asset…
        </div>
      );
    }
    // Matched (to a bank transaction, or paid with cash): the amount is what
    // was reconciled, so it isn't editable until the match is undone — the
    // same path the register's Edit takes.
    if (!canEditAsset(editing)) {
      return <AssetMatchedNotice assetId={editing.id} name={editing.name} />;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={guardNavigate(ASSETS_ROOT)}
        >
          <ArrowLeft />
          Assets
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {assetId
              ? "Edit asset"
              : mode === "upload"
                ? "Upload asset"
                : "New asset"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Fields marked with <span className="text-destructive">*</span> are
            required.
          </p>
        </div>
      </div>

      <Stepper current={step} steps={visibleSteps} onSelect={goToStep} />

      {/* Plan without Advanced Assets: what's locked, and where to get it. */}
      {!advanced && step === 0 && <AdvancedAssetsUpsell />}

      {step === 0 &&
        (capturing ? (
          <AssetUploadStep
            onUse={(extraction, file) =>
              applyExtraction(extraction, file, true)
            }
            onEdit={(extraction, file) =>
              applyExtraction(extraction, file, false)
            }
            onSkip={() => setCaptured(true)}
          />
        ) : (
          <AssetStep
            draft={draft}
            patch={patch}
            issueFor={issueFor}
            stockTracked={stockTracked}
            stockOnHand={stockOnHand}
          />
        ))}
      {step === 1 && advanced && (
        <DetailsStep draft={draft} patch={patch} issueFor={issueFor} />
      )}
      {step === 2 && <PhotosStep draft={draft} patch={patch} advanced={advanced} />}
      {step === 3 && advanced && (
        <DepreciationStep draft={draft} patch={patch} issueFor={issueFor} />
      )}

      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
        data-usertour="asset-form-actions"
      >
        <Button
          variant="outline"
          onClick={() => {
            if (previousVisible !== undefined) {
              setStep(previousVisible);
              return;
            }
            // First step: Back leaves the form — to the "how do you want to add
            // it" chooser for a new asset, the register for an edit — through
            // the same unsaved-changes guard Cancel uses. (It used to sit
            // disabled and faded here, which read as broken.)
            guardNavigate(assetId ? ASSETS_ROOT : `${ASSETS_ROOT}/new`)();
          }}
        >
          Back
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {submitted && issues.length > 0 && (
            <span className="text-xs text-destructive tabular">
              {issues.length}{" "}
              {issues.length === 1 ? "field needs" : "fields need"} attention
            </span>
          )}
          <Button variant="outline" asChild>
            <Link
              href={ASSETS_ROOT}
              onClick={(event) => {
                if (dirty) {
                  event.preventDefault();
                  guardNavigate(ASSETS_ROOT)();
                }
              }}
            >
              Cancel
            </Link>
          </Button>
          {isLast ? (
            <Button onClick={save} disabled={saving || saved}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Saving\u2026" : "Save Asset"}
            </Button>
          ) : (
            <Button
              // Nothing to carry forward until capture has read something, and
              // a Next that skips the step it's standing on is a trap.
              disabled={capturing}
              onClick={() => goToStep(nextVisible ?? step)}
            >
              Next
            </Button>
          )}
        </div>
      </div>

      {dialog}
      {/* Mounted here as well as on the Assets screen: the Manage registry
          link under either dropdown is on this route, which never renders
          AssetDialogs. */}
      <AssetRegistryDialog />
    </div>
  );
}

/** A picked file as a data URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** The edit route when the asset (or the registry it needs) didn't load. */
function AssetLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <Empty>
        <EmptyMedia>
          <Landmark aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>Couldn&apos;t open this asset</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </div>
        <EmptyActions>
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={ASSETS_ROOT}>Back to assets</Link>
          </Button>
        </EmptyActions>
      </Empty>
    </div>
  );
}

/**
 * The edit route opened on a matched asset (a bookmark, a typed URL). Undo
 * goes through the register's own edit link (`/assets?edit=<id>`), whose gate
 * opens the Undo dialog worded for an edit and comes back here once nothing
 * is left matched.
 */
function AssetMatchedNotice({ assetId, name }: { assetId: string; name: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <Empty>
        <EmptyMedia>
          <Link2 aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>{name} is matched</EmptyTitle>
          <EmptyDescription>
            A matched asset can&apos;t be edited — undo the match first. Its
            cost is what the bank transaction or cash payment was reconciled
            against.
          </EmptyDescription>
        </div>
        <EmptyActions>
          <Button size="sm" asChild>
            <Link href={`${ASSETS_ROOT}?edit=${assetId}`}>Undo match to edit</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={ASSETS_ROOT}>Back to assets</Link>
          </Button>
        </EmptyActions>
      </Empty>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Stepper
 * ------------------------------------------------------------------ */

function Stepper({
  current,
  steps,
  onSelect,
}: {
  current: number;
  /** The step indices on this plan, in order (hidden ones are left out). */
  steps: number[];
  onSelect: (step: number) => void;
}) {
  return (
    <ol
      className="flex flex-wrap items-center gap-x-2 gap-y-2"
      data-usertour="asset-form-steps"
    >
      {steps.map((index, position) => {
        const label = STEPS[index];
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-primary/10 text-primary",
                  !active && !done && "border border-input",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" /> : position + 1}
              </span>
              {label}
            </button>
            {position < steps.length - 1 && (
              <span className="h-px w-4 bg-border sm:w-8" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Step 1 — Asset details
 * ------------------------------------------------------------------ */

type Patch = (
  values: Partial<AssetDraft> | ((current: AssetDraft) => Partial<AssetDraft>),
) => void;

type StepProps = {
  draft: AssetDraft;
  patch: Patch;
  issueFor: (key: string) => string | undefined;
};

/**
 * The asset name, with a live search of sole-ocr's shared products/services
 * catalogue underneath it — the same `/services/all/autocomplete` sole-webapp's
 * own Asset and Expense forms call as you type. Picking a result can also fill
 * in the cost price, category and (for a tracked item) its stock figures, but
 * the field stays free text: nothing here narrows what you can type or forces
 * a choice from the list.
 */
function AssetNameField({
  value,
  onChange,
  onSelectSuggestion,
  error,
}: {
  value: string;
  onChange: (name: string) => void;
  onSelectSuggestion: (entry: ServiceAutocompleteEntry) => void;
  error?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const requestId = React.useRef(0);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<ServiceAutocompleteEntry[]>(
    [],
  );

  React.useEffect(() => {
    const query = value.trim();
    if (query.length < AUTOCOMPLETE_MIN_LENGTH) {
      requestId.current += 1;
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchServiceAutocomplete(query)
        .then((results) => {
          // A newer keystroke has already superseded this request.
          if (requestId.current !== id) return;
          setSuggestions(results);
          setLoading(false);
        })
        .catch(() => {
          if (requestId.current !== id) return;
          setSuggestions([]);
          setLoading(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  React.useEffect(() => {
    const onOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const showPanel = open && (loading || suggestions.length > 0);

  return (
    <div ref={containerRef} className="relative">
      <Input
        id="asset-name"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="e.g. Toyota HiLux ute"
        aria-invalid={!!error}
        autoComplete="off"
      />
      {showPanel && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Searching…
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {suggestions.map((entry, index) => (
                <li key={`${entry.name}-${index}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSuggestion(entry);
                      setOpen(false);
                    }}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                  >
                    <span className="font-medium">{entry.name}</span>
                    {entry.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {entry.description}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** 12.5 → "12.5", 15 → "15" — a rate as the summary line prints it. */
function rateText(rate: number): string {
  return String(Math.round(rate * 10000) / 10000);
}

/**
 * The "Include GST" hint, worked through at the business's rate. At 10% it reads
 * exactly as it always has: "the price ÷ 11 — so $110 contains $10 of GST".
 */
function inclusiveGstHint(
  rate: number,
  word: string,
  locale: string,
  currency: string,
): string {
  const money = (amount: number) => {
    const digits = Number.isInteger(amount) ? 0 : 2;
    return formatMoneyIn({ locale, currency }, amount, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };
  const formula =
    rate === 10 ? "÷ 11" : `× ${rateText(rate)} ÷ ${rateText(100 + rate)}`;
  return `On means the cost above already includes ${word}. The component is the price ${formula} — so ${money(100 + rate)} contains ${money(rate)} of ${word}, leaving ${money(100)} ex-${word}.`;
}

function AssetStep({
  draft,
  patch,
  issueFor,
  stockTracked = false,
  stockOnHand = 0,
}: StepProps & {
  /** Editing an asset whose linked stock item is already tracked. */
  stockTracked?: boolean;
  stockOnHand?: number;
}) {
  /*
   * GST in the business's own terms: its word (GST, VAT) and the rate on the
   * purchase date — its custom rate, else 10% AU / 15% NZ / 15% ZA.
   */
  const { country } = useCountryContext();
  const assetTax = documentTax(country, draft.purchaseDate);
  const gst = gstBreakdown(draft.costPrice, draft.gst, assetTax.rate);
  const taxHint = inclusiveGstHint(
    assetTax.rate,
    assetTax.word,
    country.locale,
    country.currency,
  );
  const suppliersQuery = useQuery({
    queryKey: ["asset-suppliers"],
    queryFn: () => fetchBusinessContacts("Supplier"),
  });
  const suppliers = suppliersQuery.data ?? [];

  return (
    <div className="space-y-4">
      <FormSection
        icon={Landmark}
        title="Asset details"
        description="What it is, what it cost, and where it came from."
        tourId="asset-details"
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Field
            label="Asset name"
            htmlFor="asset-name"
            required
            error={issueFor("name")}
          >
            <AssetNameField
              value={draft.name}
              onChange={(name) => patch({ name })}
              onSelectSuggestion={(entry) => {
                const matchedCategory = ASSET_CATEGORIES.find(
                  (category) =>
                    category.toLowerCase() === entry.category.trim().toLowerCase(),
                );
                patch({
                  name: entry.name,
                  ...(entry.costPrice ? { costPrice: entry.costPrice } : {}),
                  ...(matchedCategory ? { category: matchedCategory } : {}),
                  ...(entry.tracked
                    ? {
                        tracked: true,
                        unitType: entry.quantityType || draft.unitType,
                        openingStock: entry.openingStock,
                        lowStockAlert: entry.lowStockAlert,
                      }
                    : {}),
                  // The picked item's own sale price, so linking to it doesn't
                  // look like it has none.
                  ...(entry.productId && entry.salePrice
                    ? { salePrice: entry.salePrice }
                    : {}),
                  // Always set, deterministically: null clears a stale link
                  // from a previous pick just as surely as an id sets a new
                  // one — a plain services_all row has nothing to link to.
                  inventoryProductId: entry.productId,
                });
              }}
              error={issueFor("name")}
            />
          </Field>
        </div>

        <Field
          label={`Cost price (${activeCurrencySymbol()})`}
          htmlFor="asset-cost"
          required
          error={issueFor("costPrice")}
        >
          <Input
            id="asset-cost"
            inputMode="decimal"
            value={draft.costPrice}
            onChange={(event) => patch({ costPrice: event.target.value })}
            placeholder="0.00"
            className="tabular"
            aria-invalid={!!issueFor("costPrice")}
          />
        </Field>

        <Field label="Date purchased" required error={issueFor("purchaseDate")}>
          <DatePicker
            value={draft.purchaseDate}
            onChange={(purchaseDate) => patch({ purchaseDate })}
            label="Date purchased"
          />
        </Field>

        <BusinessContactSelect
          type="Supplier"
          label="Supplier"
          contacts={suppliers}
          loading={suppliersQuery.isLoading}
          contactId={draft.supplierId}
          contactName={draft.supplierName}
          error={issueFor("supplier")}
          onSelect={({ contactId, contactName }) =>
            patch({ supplierId: contactId, supplierName: contactName })
          }
          onContactsChanged={() => suppliersQuery.refetch()}
        />

        <Field label="Category" required error={issueFor("category")}>
          <Select
            value={draft.category}
            onValueChange={(value) => {
              const category = value as AssetCategory;
              patch({
                category,
                // Choosing Inventory starts the stock block the way it's
                // usually wanted — counted, with a low-stock warning at 5.
                ...(category === TRACKED_CATEGORY &&
                draft.category !== TRACKED_CATEGORY
                  ? {
                      tracked: true,
                      unitType: draft.unitType || "Items",
                      lowStockAlert: draft.lowStockAlert || "5",
                    }
                  : {}),
              });
            }}
          >
            <SelectTrigger aria-label="Category" aria-invalid={!!issueFor("category")}>
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {ASSET_CATEGORIES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      {/* Only the one category carries stock, so the block appears with it. */}
      {draft.category === TRACKED_CATEGORY && (
        <FormSection
          icon={Images}
          title="Inventory tracking"
          description="This category carries stock, so Sole can keep a count."
          tourId="asset-inventory"
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field
            label="Unit type"
            required
            error={issueFor("unitType")}
            hint={stockTracked ? "Locked — stock is counted in this unit." : undefined}
          >
            <Select
              value={draft.unitType}
              onValueChange={(unitType) => patch({ unitType })}
              disabled={stockTracked}
            >
              <SelectTrigger aria-label="Unit type">
                <SelectValue placeholder="Choose a unit" />
              </SelectTrigger>
              <SelectContent>
                {UNIT_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label={`Sale price (${activeCurrencySymbol()})`}
            htmlFor="asset-sale-price"
            error={issueFor("salePrice")}
            hint="What you sell one for — filled in when you pick it on a quote or invoice."
          >
            <Input
              id="asset-sale-price"
              inputMode="decimal"
              value={draft.salePrice ?? ""}
              onChange={(event) => patch({ salePrice: event.target.value })}
              placeholder="0.00"
              className="tabular"
              aria-invalid={!!issueFor("salePrice")}
            />
          </Field>

          <div className="sm:col-span-2">
            <Label className="flex cursor-pointer items-start gap-3 font-normal">
              <Checkbox
                checked={draft.tracked}
                onCheckedChange={(checked) =>
                  patch({ tracked: checked === true })
                }
                // Untracking with units on hand would hide that stock; the
                // backend refuses it too.
                disabled={stockTracked && stockOnHand > 0}
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">
                  I track this item
                </span>
                <span className="block text-xs text-muted-foreground">
                  {stockTracked && stockOnHand > 0
                    ? `${stockOnHand} still in stock — adjust stock to 0 before turning tracking off.`
                    : "Keep a stock count and warn you when it runs low."}
                </span>
              </span>
            </Label>
          </div>

          {draft.tracked && (
            <>
              {stockTracked ? (
                <Field
                  label="Stock on hand"
                  hint="Use Adjust stock on the Inventory list to change this."
                >
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular text-muted-foreground">
                    {stockOnHand} {draft.unitType || "units"}
                  </div>
                </Field>
              ) : (
                <Field label="Opening stock" htmlFor="asset-stock">
                  <Input
                    id="asset-stock"
                    placeholder="e.g. 10"
                    inputMode="numeric"
                    value={draft.openingStock}
                    onChange={(event) =>
                      patch({ openingStock: event.target.value })
                    }
                    className="tabular"
                  />
                </Field>
              )}
              <Field label="Low stock alert at" htmlFor="asset-low">
                <Input
                  id="asset-low"
                  placeholder="e.g. 5"
                  inputMode="numeric"
                  value={draft.lowStockAlert}
                  onChange={(event) =>
                    patch({ lowStockAlert: event.target.value })
                  }
                  className="tabular"
                />
              </Field>
            </>
          )}
        </FormSection>
      )}

      <FormSection
        icon={Percent}
        title={`${assetTax.word} & payment`}
        description={`Whether the price above already includes ${assetTax.word}, and how it was paid.`}
        tourId="asset-gst-payment"
      >
        <ToggleRow
          label={`Include ${assetTax.word}`}
          hint={taxHint}
          checked={draft.gst}
          onChange={(gstOn) => patch({ gst: gstOn })}
        />

        {/* The three lines the toggle implies, so the split is never a guess. */}
        <dl className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm tabular">
          <SummaryLine
            label={`Sub-total ex ${assetTax.word}`}
            value={assetMoney(gst.subTotal)}
          />
          <SummaryLine
            label={`${assetTax.word} ${rateText(assetTax.rate)}%`}
            value={assetMoney(gst.gst)}
          />
          <SummaryLine
            label={`Total inc ${assetTax.word}`}
            value={assetMoney(gst.total)}
            strong
          />
        </dl>

        <ToggleRow
          label="Paid with cash"
          hint="Records it as settled from cash on hand rather than a bank account."
          checked={draft.paidWithCash}
          onChange={(paidWithCash) => patch({ paidWithCash })}
        />
      </FormSection>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={cn("text-muted-foreground", strong && "text-foreground")}>
        {label}
      </dt>
      <dd className={cn(strong && "font-semibold")}>{value}</dd>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = `toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Step 2 — More asset information
 * ------------------------------------------------------------------ */

function DetailsStep({ draft, patch, issueFor }: StepProps) {
  const brands = useAssetRegistryStore((state) => state.brands);
  const types = useAssetRegistryStore((state) => state.types);
  const createBrand = useCreateAssetBrandMutation();
  const createType = useCreateAssetTypeMutation();

  return (
    <FormSection
      icon={FileText}
      title="More asset information"
      description="What it is exactly, and how you'd identify it again."
      className="grid gap-4 sm:grid-cols-2"
    >
      {/* Both read the registry rather than the form: a make typed free-hand
          was how the register ended up with four spellings of one brand, and
          nothing downstream could group by it. */}
      <RegistryCombobox
        label="Make / brand"
        required
        value={draft.brand}
        options={brands}
        onChange={(brand) => patch({ brand })}
        onCreate={async (name) => {
          try {
            const stored = await createBrand(name);
            toast.success(`${stored} added to the registry`);
            return stored;
          } catch (error) {
            toast.error(apiErrorMessage(error, "Couldn't add that brand"));
            return draft.brand;
          }
        }}
        placeholder="Select a make or brand"
        searchPlaceholder="Search brands"
        emptyHint="No brands match"
        createLabel="Add new brand"
        error={issueFor("brand")}
      />

      <RegistryCombobox
        label="Asset type"
        required
        value={draft.assetType}
        options={types}
        onChange={(assetType) => patch({ assetType })}
        onCreate={async (name) => {
          try {
            const stored = await createType(name);
            toast.success(`${stored} added to the registry`);
            return stored;
          } catch (error) {
            toast.error(apiErrorMessage(error, "Couldn't add that asset type"));
            return draft.assetType;
          }
        }}
        placeholder="Select asset type"
        searchPlaceholder="Search asset types"
        emptyHint="No asset types match"
        createLabel="Add new asset type"
        error={issueFor("assetType")}
      />

      <Field label="Model no" htmlFor="asset-model">
        <Input
          id="asset-model"
          placeholder="e.g. A2992"
          value={draft.modelNo}
          onChange={(event) => patch({ modelNo: event.target.value })}
        />
      </Field>

      <Field label="Serial no" htmlFor="asset-serial">
        <Input
          id="asset-serial"
          placeholder="e.g. C02XG0FDH7JY"
          value={draft.serialNo}
          onChange={(event) => patch({ serialNo: event.target.value })}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field
          label="Identifiable marks"
          htmlFor="asset-marks"
          hint="Anything that would tell this one apart — scratches, decals, engravings."
        >
          <Textarea
            id="asset-marks"
            placeholder="e.g. Scratch on the lid, company sticker on the base"
            rows={3}
            value={draft.identifyingMarks}
            onChange={(event) =>
              patch({ identifyingMarks: event.target.value })
            }
          />
        </Field>
      </div>

      <Field label="Warranty expiry date">
        <DatePicker
          value={draft.warrantyExpiry}
          onChange={(warrantyExpiry) => patch({ warrantyExpiry })}
          label="Warranty expiry date"
        />
      </Field>

      {/*
        Shown on every asset, for now.

        Test and tag only applies to electrical equipment, so this ought to be
        conditional — but there's nothing on the draft that says whether an
        asset is electrical. Asset type holds how it was acquired (New, Used,
        Leased), not what it is, and category is too blunt: Tools covers both a
        drop saw and a hammer, and hiding the field for a category would drop
        the date off assets that need one. Keying it off a flag on the registry
        entry, or a checkbox on the asset, is the change that would make it
        safe — until then, an extra optional date is cheaper than a missing
        compliance record.
      */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          Test &amp; tag date
          <InfoTip text="Electrical equipment used at work has to be tested and tagged periodically. Record the last test so Sole can remind you when the next one is due." />
        </Label>
        <DatePicker
          value={draft.testAndTagDate}
          onChange={(testAndTagDate) => patch({ testAndTagDate })}
          label="Test and tag date"
        />
      </div>
    </FormSection>
  );
}

/* ------------------------------------------------------------------ *
 * Step 3 — Photos & documents
 * ------------------------------------------------------------------ */

/**
 * The four things worth photographing, and what each tile will take. Only the
 * receipt accepts a PDF — the other three are asking you to look at the thing
 * itself, and a PDF of a serial plate is nobody's intention.
 */
const PHOTO_SLOTS: {
  slot: AssetPhotoSlot;
  label: string;
  hint: string;
  icon: LucideIcon;
  pdf?: boolean;
}[] = [
  {
    slot: "photo",
    label: "Asset photo",
    hint: "How it looks",
    icon: ImagePlus,
  },
  {
    slot: "serial",
    label: "Serial / model number",
    hint: "The plate or label",
    icon: ScanLine,
  },
  {
    slot: "receipt",
    label: "Receipt / invoice",
    hint: "Proof of purchase",
    icon: ReceiptText,
    pdf: true,
  },
  {
    slot: "marks",
    label: "Identifiable marks",
    hint: "Anything distinctive",
    icon: ScanLine,
  },
];

function PhotosStep({
  draft,
  patch,
  advanced,
}: {
  draft: AssetDraft;
  patch: Patch;
  /** Without Advanced Assets only the asset photo slot is offered (old AddAssets). */
  advanced: boolean;
}) {
  const [previewDoc, setPreviewDoc] = React.useState<AssetFile | null>(null);
  // Against the current draft, not this render's: a file is read
  // asynchronously, and two slots filled in quick succession would otherwise
  // each overwrite the other.
  const setPhoto = (slot: AssetPhotoSlot, file: AssetFile | undefined) =>
    patch((current) => {
      const photos = { ...current.photos };
      if (file) photos[slot] = file;
      else delete photos[slot];
      return { photos };
    });

  const addDocuments = async (files: FileList) => {
    const room = MAX_DOCUMENTS - draft.documents.length;
    if (room <= 0) {
      toast.error(`That's the limit — ${MAX_DOCUMENTS} documents per asset.`);
      return;
    }
    const sized = [...files].filter((file) => {
      if (file.size <= MAX_DOCUMENT_BYTES) return true;
      toast.error(`${file.name} is over 20MB.`);
      return false;
    });
    if (sized.length > room) {
      toast.error(`Only ${room} more could be added — ${MAX_DOCUMENTS} documents per asset.`);
    }
    // Every file read first, then one update: each reader patching on its own
    // started from the same stale list, so only the last file survived.
    let read: AssetFile[];
    try {
      read = await Promise.all(
        sized.slice(0, room).map(async (file) => ({
          dataUrl: await readAsDataUrl(file),
          name: file.name,
          size: file.size,
        })),
      );
    } catch {
      toast.error("Couldn't read those files.");
      return;
    }
    if (read.length === 0) return;
    patch((current) => ({
      documents: [...current.documents, ...read].slice(0, MAX_DOCUMENTS),
    }));
  };

  return (
    <div className="space-y-4">
      <FormSection
        icon={Images}
        title="Photos"
        description="A picture of each of these makes an insurance claim far easier."
        // auto-rows-fr so all four tiles stand the same height whatever state
        // they're in — a filled tile is taller than an empty one, and a grid
        // that reflows as you go makes the step feel unfinished.
        className="grid gap-4 sm:auto-rows-fr sm:grid-cols-2"
      >
        {PHOTO_SLOTS.filter(({ slot }) => advanced || slot === "photo").map(({ slot, label, hint, icon, pdf }) => (
          <PhotoTile
            key={slot}
            slot={slot}
            label={label}
            hint={hint}
            icon={icon}
            pdf={pdf}
            file={draft.photos[slot]}
            onPick={(file) => setPhoto(slot, file)}
          />
        ))}
      </FormSection>

      <FormSection
        icon={Paperclip}
        title="Supporting documents"
        description={`Warranties, manuals, finance paperwork — up to ${MAX_DOCUMENTS} files, 20MB each.`}
      >
        <Dropzone onFiles={addDocuments} />

        {draft.documents.length > 0 && (
          <ul className="space-y-1.5">
            {draft.documents.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <Paperclip
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => setPreviewDoc(file)}
                  className="min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline"
                  title={`Preview ${file.name}`}
                >
                  {file.name}
                </button>
                {file.size > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular">
                    {formatBytes(file.size)}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  aria-label={`View ${file.name}`}
                  onClick={() => setPreviewDoc(file)}
                >
                  <Eye className="size-3.5" />
                  View
                </Button>
                {isSavedAssetFile(file) ? (
                  // Already on the server: also open it where it's stored.
                  <Button variant="ghost" size="icon" className="size-7" asChild>
                    <a href={file.dataUrl} target="_blank" rel="noreferrer" aria-label={`Open ${file.name} in a new tab`}>
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    patch({
                      documents: draft.documents.filter(
                        (_, position) => position !== index,
                      ),
                    })
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <FilePreviewDialog file={previewDoc} onClose={() => setPreviewDoc(null)} />
      </FormSection>
    </div>
  );
}

/**
 * One upload slot, as a drop-zone rather than a card with two buttons on it.
 *
 * The dashed border stays after a file lands: the tile is still somewhere you
 * can drop a replacement, and four tiles that all keep the same frame read as
 * one set of four rather than a mix of done and not-done cards. What changes is
 * the contents — prompt out, preview in — and the green tick that says so.
 */
function PhotoTile({
  slot,
  label,
  hint,
  icon: Icon,
  pdf = false,
  file,
  onPick,
}: {
  slot: AssetPhotoSlot;
  label: string;
  hint: string;
  icon: LucideIcon;
  pdf?: boolean;
  file?: AssetFile;
  onPick: (file: AssetFile | undefined) => void;
}) {
  const browseRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const inputId = `asset-photo-${slot}`;

  /** Phones open their own camera app; desktops get a live webcam preview. */
  const openCamera = () => {
    if (prefersNativeCamera()) cameraRef.current?.click();
    else setCameraOpen(true);
  };
  const accept = pdf ? "image/*,application/pdf" : "image/*";

  /**
   * Whatever the file arrived by — picker, camera or drop — it gets checked
   * here. A drop can't be filtered by an accept attribute, so the tile has to
   * say no itself rather than store a .zip and call it a photo.
   */
  const take = (chosen: File | undefined) => {
    if (!chosen) return;
    const image = chosen.type.startsWith("image/");
    const document_ = pdf && chosen.type === "application/pdf";
    if (!image && !document_) {
      toast.error(
        pdf
          ? `${label} takes an image or a PDF.`
          : `${label} takes an image — try a photo or a screenshot.`,
      );
      return;
    }
    if (chosen.size > MAX_DOCUMENT_BYTES) {
      toast.error(`${chosen.name} is over 20MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      onPick({
        dataUrl: String(reader.result),
        name: chosen.name,
        size: chosen.size,
      });
    reader.readAsDataURL(chosen);
  };

  const heading = (
    <>
      <span
        className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {label}
          {file ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <Check className="size-3.5" aria-hidden />
              Added
            </span>
          ) : null}
        </span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </>
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files[0]);
      }}
      className={cn(
        "flex h-full flex-col gap-3 rounded-lg border border-dashed p-4",
        // Only the colour animates, and only for people who want animation.
        "motion-safe:transition-colors",
        over ? "border-primary bg-primary/[0.04]" : "border-border bg-muted/30",
      )}
    >
      {file ? (
        <div className="flex items-start gap-3">{heading}</div>
      ) : (
        // The prompt is the label for the file input, so the whole block is a
        // click target without becoming a second tab stop next to Browse.
        <label
          htmlFor={inputId}
          className="flex cursor-pointer items-start gap-3"
        >
          {heading}
        </label>
      )}

      {file ? (
        // A saved photo is the server's URL, not a data:image URL — the tile
        // works out which it is, so saved photos show (and open) too.
        <AssetFileTile file={file} label={label} onOpen={() => setPreviewing(true)} />
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2">
        {file ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewing(true)}
            >
              <Eye />
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => browseRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove ${label}`}
              onClick={() => onPick(undefined)}
            >
              Remove
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={() => browseRef.current?.click()}>
              <Upload />
              Browse
            </Button>
            <Button variant="ghost" size="sm" onClick={openCamera}>
              <Camera />
              Camera
            </Button>
          </>
        )}
      </div>

      <FilePreviewDialog
        file={previewing ? (file ?? null) : null}
        title={label}
        onClose={() => setPreviewing(false)}
      />
      <CameraCaptureDialog
        open={cameraOpen}
        title={label}
        onOpenChange={setCameraOpen}
        onCapture={take}
      />

      {/* sr-only rather than hidden, and out of the tab order: Browse is the
          control, but a hidden input can't be reached by a label click. */}
      <input
        ref={browseRef}
        id={inputId}
        type="file"
        accept={accept}
        tabIndex={-1}
        className="sr-only"
        aria-label={`Upload ${label}`}
        onChange={(event) => {
          take(event.currentTarget.files?.[0]);
          // Same file twice in a row fires no change event otherwise, so
          // re-picking what you just removed would do nothing.
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        className="sr-only"
        aria-label={`Photograph ${label}`}
        onChange={(event) => {
          take(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function Dropzone({ onFiles }: { onFiles: (files: FileList) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          onFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          over
            ? "border-primary/50 bg-primary/[0.04]"
            : "border-border hover:border-primary/40 hover:bg-muted/40",
        )}
      >
        <span
          className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"
          aria-hidden
        >
          <Upload className="size-5" />
        </span>
        <span className="text-sm font-medium">
          Drag &amp; drop, or click to browse
        </span>
        <span className="text-xs text-muted-foreground">
          Images or PDF · up to {MAX_DOCUMENTS} files, 20MB each
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        aria-label="Supporting documents"
        onChange={(event) => {
          if (event.target.files) onFiles(event.target.files);
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Step 4 — Depreciation
 * ------------------------------------------------------------------ */

function DepreciationStep({ draft, patch, issueFor }: StepProps) {
  const depreciation = draft.depreciation;
  // As on the depreciation screen: only diminishing value takes an override.
  const overrideApplies = depreciation.method === "Diminishing value";
  const set = (values: Partial<AssetDraft["depreciation"]>) =>
    patch({ depreciation: { ...depreciation, ...values } });

  /*
   * Errors show once Save has been tried (`issueFor`) or as soon as a field is
   * left — the same rules either way, read from `assetIssues` so the step and
   * the Save gate can't disagree.
   */
  const { country } = useCountryContext();
  const [touched, setTouched] = React.useState<Set<string>>(new Set());
  const touch = (key: string) =>
    setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  const stepIssues = assetIssues(draft, documentTax(country, draft.purchaseDate).rate);
  const errorFor = (key: string) =>
    issueFor(key) ??
    (touched.has(key)
      ? stepIssues.find((issue) => issue.key === key)?.message
      : undefined);

  return (
    <FormSection
      icon={TrendingDown}
      title="Depreciation"
      description="How the asset's value is written down over the years you use it."
    >
      <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
        <div className="min-w-0 space-y-0.5">
          <Label
            htmlFor="dep-on"
            className="flex items-center gap-1.5 text-sm font-medium"
          >
            Enable depreciation
            <InfoTip text="Most business assets lose value over time, and that loss is deductible. Turning this on lets Sole calculate the yearly amount instead of you claiming the whole cost at once." />
          </Label>
          <p className="text-xs text-muted-foreground">
            Off means the full cost is claimed in the year you bought it.
          </p>
        </div>
        <Switch
          id="dep-on"
          checked={depreciation.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
        />
      </div>

      {depreciation.enabled && (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Method</legend>
            <RadioGroup
              value={depreciation.method}
              onValueChange={(method) =>
                set({ method: method as DepreciationMethod })
              }
              className="space-y-2"
            >
              {DEPRECIATION_METHODS.map((method) => (
                <Label
                  key={method}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 font-normal"
                >
                  <RadioGroupItem value={method} />
                  {method}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* A full write-off has no life and no rate to set — it's the
                whole cost in year one. */}
            {depreciation.method !== "Full depreciation on purchase" && (
              <>
                <Field
                  label="Effective life (years)"
                  htmlFor="dep-life"
                  required
                  error={errorFor("effectiveLife")}
                >
                  <Input
                    id="dep-life"
                    placeholder="e.g. 5"
                    inputMode="decimal"
                    value={depreciation.effectiveLife}
                    onChange={(event) =>
                      set({ effectiveLife: event.target.value })
                    }
                    onBlur={() => touch("effectiveLife")}
                    className="tabular"
                    aria-invalid={!!errorFor("effectiveLife")}
                  />
                </Field>

                <Field
                  label="Override rate (%)"
                  htmlFor="dep-rate"
                  hint={
                    overrideApplies
                      ? "Leave blank to use the rate the method implies."
                      : "Only used for diminishing value — straight line has a fixed rate."
                  }
                  error={errorFor("overrideRate")}
                >
                  <Input
                    id="dep-rate"
                    placeholder="Auto-calculated"
                    inputMode="decimal"
                    disabled={!overrideApplies}
                    value={depreciation.overrideRate}
                    onChange={(event) =>
                      set({ overrideRate: event.target.value })
                    }
                    onBlur={() => touch("overrideRate")}
                    className="tabular"
                    aria-invalid={!!errorFor("overrideRate")}
                  />
                </Field>
              </>
            )}

            <Field
              label={`Residual (salvage) value (${activeCurrencySymbol()})`}
              htmlFor="dep-residual"
              error={errorFor("residualValue")}
            >
              <Input
                id="dep-residual"
                placeholder="0.00"
                inputMode="decimal"
                value={depreciation.residualValue}
                onChange={(event) => set({ residualValue: event.target.value })}
                onBlur={() => touch("residualValue")}
                className="tabular"
                aria-invalid={!!errorFor("residualValue")}
              />
            </Field>

            <Field
              label={`Cost limit (${activeCurrencySymbol()})`}
              htmlFor="dep-limit"
              error={errorFor("costLimit")}
            >
              <Input
                id="dep-limit"
                placeholder="No limit"
                inputMode="decimal"
                value={depreciation.costLimit}
                onChange={(event) => set({ costLimit: event.target.value })}
                onBlur={() => touch("costLimit")}
                className="tabular"
                aria-invalid={!!errorFor("costLimit")}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Depreciation start date">
                <DatePicker
                  value={depreciation.startDate || draft.purchaseDate}
                  onChange={(startDate) => set({ startDate })}
                  label="Depreciation start date"
                />
              </Field>
            </div>
          </div>
        </>
      )}
    </FormSection>
  );
}
