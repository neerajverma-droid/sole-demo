"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Check,
  FileText,
  ImagePlus,
  Images,
  Landmark,
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
  emptyAssetDraft,
  firstIncompleteStep,
  gstBreakdown,
  type AssetCategory,
  type AssetDraft,
  type AssetExtraction,
  type AssetFile,
  type AssetPhotoSlot,
  type DepreciationMethod,
} from "@/lib/assets";
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
  useCreateAssetBrandMutation,
  useCreateAssetTypeMutation,
} from "@/hooks/use-asset-registry-query";
import { useAssetQuery, useSaveAssetMutation } from "@/hooks/use-asset-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { useAssetRegistryStore } from "@/stores/asset-registry";

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
  const { data: editing, isLoading: loadingEditing } = useAssetQuery(assetId);
  const saveAsset = useSaveAssetMutation();

  const today = toIsoDate(new Date());

  const [draft, setDraft] = React.useState<AssetDraft>(emptyAssetDraft(today));
  const [step, setStep] = React.useState(0);
  const [submitted, setSubmitted] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

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

  const patch = (values: Partial<AssetDraft>) => {
    setDirty(true);
    setDraft((current) => ({ ...current, ...values }));
  };

  const issues = assetIssues(draft);
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
    setStep(next);
  };

  const { guardNavigate, dialog } = useUnsavedChanges(dirty && !submitted);

  const save = async () => {
    setSubmitted(true);
    const incomplete = firstIncompleteStep(issues);
    if (incomplete !== null) {
      setStep(incomplete);
      toast.error("Some details are still missing");
      return;
    }
    setSaving(true);
    try {
      await saveAsset(draft, editing?.id);
      setDirty(false);
      toast.success(editing ? `${draft.name} updated` : `${draft.name} added to the register`);
      router.push(ASSETS_ROOT);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save this asset");
    } finally {
      setSaving(false);
    }
  };

  const isLast = step === STEPS.length - 1;
  const capturing = mode === "upload" && !editing && !captured;

  /** Take a reading: fields onto the draft, document into the asset's files. */
  const applyExtraction = (
    extraction: AssetExtraction,
    file: AssetFile,
    advance: boolean,
  ) => {
    patch({
      ...extraction.fields,
      documents: [...draft.documents, file],
    });
    setCaptured(true);
    if (advance) setStep(1);
  };

  // Editing an asset that hasn't loaded yet: hold off on the wizard rather
  // than rendering it against a still-empty draft.
  if (assetId && loadingEditing) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-sm text-muted-foreground">
        Loading asset…
      </div>
    );
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
            {editing
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

      <Stepper current={step} onSelect={goToStep} />

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
          <AssetStep draft={draft} patch={patch} issueFor={issueFor} />
        ))}
      {step === 1 && (
        <DetailsStep draft={draft} patch={patch} issueFor={issueFor} />
      )}
      {step === 2 && <PhotosStep draft={draft} patch={patch} />}
      {step === 3 && (
        <DepreciationStep draft={draft} patch={patch} issueFor={issueFor} />
      )}

      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
        data-usertour="asset-form-actions"
      >
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
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
                if (dirty && !submitted) {
                  event.preventDefault();
                  guardNavigate(ASSETS_ROOT)();
                }
              }}
            >
              Cancel
            </Link>
          </Button>
          {isLast ? (
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Saving\u2026" : "Save Asset"}
            </Button>
          ) : (
            <Button
              // Nothing to carry forward until capture has read something, and
              // a Next that skips the step it's standing on is a trap.
              disabled={capturing}
              onClick={() => goToStep(Math.min(STEPS.length - 1, step + 1))}
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

/* ------------------------------------------------------------------ *
 * Stepper
 * ------------------------------------------------------------------ */

function Stepper({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (step: number) => void;
}) {
  return (
    <ol
      className="flex flex-wrap items-center gap-x-2 gap-y-2"
      data-usertour="asset-form-steps"
    >
      {STEPS.map((label, index) => {
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
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              {label}
            </button>
            {index < STEPS.length - 1 && (
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

type StepProps = {
  draft: AssetDraft;
  patch: (values: Partial<AssetDraft>) => void;
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

function AssetStep({ draft, patch, issueFor }: StepProps) {
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
            onValueChange={(value) =>
              patch({ category: value as AssetCategory })
            }
          >
            <SelectTrigger aria-label="Category">
              <SelectValue />
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

        <div className="sm:col-span-2">
          <Field
            label={`Still owing (${activeCurrencySymbol()})`}
            htmlFor="asset-owing"
            hint="Leave blank if it's paid outright."
          >
            <Input
              id="asset-owing"
              inputMode="decimal"
              value={draft.owing}
              onChange={(event) => patch({ owing: event.target.value })}
              placeholder="0.00"
              className="tabular"
            />
          </Field>
        </div>
      </FormSection>

      {/* Only the one category carries stock, so the block appears with it. */}
      {draft.category === TRACKED_CATEGORY && (
        <FormSection
          icon={Images}
          title="Inventory tracking"
          description="This category carries stock, so Sole can keep a count."
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field label="Unit type" required error={issueFor("unitType")}>
            <Select
              value={draft.unitType}
              onValueChange={(unitType) => patch({ unitType })}
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

          <div className="sm:col-span-2">
            <Label className="flex cursor-pointer items-start gap-3 font-normal">
              <Checkbox
                checked={draft.tracked}
                onCheckedChange={(checked) =>
                  patch({ tracked: checked === true })
                }
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">
                  I track this item
                </span>
                <span className="block text-xs text-muted-foreground">
                  Keep a stock count and warn you when it runs low.
                </span>
              </span>
            </Label>
          </div>

          {draft.tracked && (
            <>
              <Field label="Opening stock" htmlFor="asset-stock">
                <Input
                  id="asset-stock"
                  inputMode="numeric"
                  value={draft.openingStock}
                  onChange={(event) =>
                    patch({ openingStock: event.target.value })
                  }
                  className="tabular"
                />
              </Field>
              <Field label="Low stock alert at" htmlFor="asset-low">
                <Input
                  id="asset-low"
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
          } catch {
            toast.error("Couldn't add that brand");
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
          } catch {
            toast.error("Couldn't add that asset type");
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
          value={draft.modelNo}
          onChange={(event) => patch({ modelNo: event.target.value })}
        />
      </Field>

      <Field label="Serial no" htmlFor="asset-serial">
        <Input
          id="asset-serial"
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
}: {
  draft: AssetDraft;
  patch: (values: Partial<AssetDraft>) => void;
}) {
  const setPhoto = (slot: AssetPhotoSlot, file: AssetFile | undefined) => {
    const photos = { ...draft.photos };
    if (file) photos[slot] = file;
    else delete photos[slot];
    patch({ photos });
  };

  const addDocuments = (files: FileList) => {
    const room = MAX_DOCUMENTS - draft.documents.length;
    if (room <= 0) {
      toast.error(`That's the limit — ${MAX_DOCUMENTS} documents per asset.`);
      return;
    }
    const accepted = [...files].slice(0, room);
    accepted.forEach((file) => {
      if (file.size > MAX_DOCUMENT_BYTES) {
        toast.error(`${file.name} is over 20MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        patch({
          documents: [
            ...draft.documents,
            {
              dataUrl: String(reader.result),
              name: file.name,
              size: file.size,
            },
          ],
        });
      reader.readAsDataURL(file);
    });
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
        {PHOTO_SLOTS.map(({ slot, label, hint, icon, pdf }) => (
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
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular">
                  {formatBytes(file.size)}
                </span>
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
  const inputId = `asset-photo-${slot}`;
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
        <div className="space-y-2">
          {file.dataUrl.startsWith("data:image") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.dataUrl}
              alt=""
              className="h-24 w-full rounded-md border border-border object-cover"
            />
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
              <span
                className="grid size-9 shrink-0 place-items-center rounded bg-primary/10 text-primary"
                aria-hidden
              >
                <FileText className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {file.name}
                </span>
                <span className="block text-xs text-muted-foreground tabular">
                  {formatBytes(file.size)}
                </span>
              </span>
            </div>
          )}
          {file.dataUrl.startsWith("data:image") ? (
            <p className="truncate text-xs text-muted-foreground">
              {file.name} ·{" "}
              <span className="tabular">{formatBytes(file.size)}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex gap-2">
        {file ? (
          <>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera />
              Camera
            </Button>
          </>
        )}
      </div>

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
  const set = (values: Partial<AssetDraft["depreciation"]>) =>
    patch({ depreciation: { ...depreciation, ...values } });

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
            <Field
              label="Effective life (years)"
              htmlFor="dep-life"
              required
              error={issueFor("effectiveLife")}
            >
              <Input
                id="dep-life"
                inputMode="decimal"
                value={depreciation.effectiveLife}
                onChange={(event) => set({ effectiveLife: event.target.value })}
                className="tabular"
                aria-invalid={!!issueFor("effectiveLife")}
              />
            </Field>

            <Field
              label="Override rate (%)"
              htmlFor="dep-rate"
              hint="Leave blank to use the rate the method implies."
            >
              <Input
                id="dep-rate"
                inputMode="decimal"
                value={depreciation.overrideRate}
                onChange={(event) => set({ overrideRate: event.target.value })}
                className="tabular"
              />
            </Field>

            <Field label={`Residual (salvage) value (${activeCurrencySymbol()})`} htmlFor="dep-residual">
              <Input
                id="dep-residual"
                inputMode="decimal"
                value={depreciation.residualValue}
                onChange={(event) => set({ residualValue: event.target.value })}
                className="tabular"
              />
            </Field>

            <Field label={`Cost limit (${activeCurrencySymbol()})`} htmlFor="dep-limit">
              <Input
                id="dep-limit"
                inputMode="decimal"
                value={depreciation.costLimit}
                onChange={(event) => set({ costLimit: event.target.value })}
                className="tabular"
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
