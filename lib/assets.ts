/**
 * Asset domain: what the business owns, what it still owes on it, and how it
 * depreciates.
 *
 * Money is held as typed strings the way invoices and expenses hold theirs —
 * the form owns the text, the helpers own the arithmetic — so a half-typed
 * "12." never has to be a number before the user has finished.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { amountError } from "@/lib/expenses";
import {
  depreciationErrors,
  isValidIsoDate,
  typedNumberForApi,
} from "@/lib/asset-validation";
import { resolveAssetSubcategoryIdByName } from "@/lib/inventory";
import { invoiceMoney } from "@/lib/invoices";

export const ASSET_CATEGORIES = [
  "Equipment",
  "Vehicle",
  "Tools",
  "Furniture",
  "Technology",
  "Inventory",
  "Property",
  "Other",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/** The one category that carries stock, and so reveals the tracking block. */
export const TRACKED_CATEGORY: AssetCategory = "Inventory";

/**
 * Which "Assets → …" account on the user's chart of accounts each category
 * posts to, by subcategory name. The one place to change it: saving resolves
 * the name to the user's own `account_subcategory_id` (see
 * `resolveAssetAccountSubcategoryId`), and an old asset with no category of
 * its own is read back the other way (see `categoryFromAccountName`).
 */
export const ASSET_CATEGORY_ACCOUNTS: Record<AssetCategory, string> = {
  Equipment: "Plant and Equipment",
  Tools: "Plant and Equipment",
  Vehicle: "Motor Vehicles",
  Technology: "Office Equipment",
  Furniture: "Office Equipment",
  Property: "Other Assets",
  Other: "Other Assets",
  Inventory: "Inventory",
};

/** Where a category's account falls back to when the user's chart lacks it. */
export const FALLBACK_ASSET_ACCOUNT = "Other Assets";

/**
 * The reverse of `ASSET_CATEGORY_ACCOUNTS`, for an asset saved before it had
 * a category of its own — several categories share an account, so each
 * account reads back as the one category that stands for it.
 */
const ACCOUNT_TO_ASSET_CATEGORY: Record<string, AssetCategory> = {
  inventory: "Inventory",
  "motor vehicles": "Vehicle",
  "plant and equipment": "Equipment",
  "office equipment": "Technology",
};

/** The category an account name stands for — anything unrecognised is Other. */
export function categoryFromAccountName(
  name: string | null | undefined,
): AssetCategory {
  return ACCOUNT_TO_ASSET_CATEGORY[(name ?? "").trim().toLowerCase()] ?? "Other";
}

/** One row of `/asset-registry/brands` or `/asset-registry/types`. */
export type AssetRegistryEntry = { id: number; name: string };

/**
 * A registry list, tidied: trimmed, de-duplicated case-insensitively (first
 * spelling wins) and sorted, so the dropdown can't offer "Makita" twice.
 */
export function normaliseRegistry(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** The entry that is exactly what was typed, whatever the casing. */
export function registryMatch(
  values: string[],
  query: string,
): string | undefined {
  const needle = query.trim().toLowerCase();
  if (!needle) return undefined;
  return values.find((value) => value.toLowerCase() === needle);
}

/**
 * How a stock asset is counted — the same four units the Inventory module
 * (`QUANTITY_TYPES` in `lib/inventory.ts`) understands, since the linked
 * stock item is a `custom_product_service` row the Inventory screen reads.
 */
export const UNIT_TYPES = ["Items", "Hours", "Days", "Km"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/** The `qty_type` the linked stock item stores — lower-case, "items" by default. */
export function unitTypeToApi(unitType: string): string {
  const match = UNIT_TYPES.find(
    (option) => option.toLowerCase() === unitType.trim().toLowerCase(),
  );
  return (match ?? "Items").toLowerCase();
}

/**
 * A stored `qty_type` back as a label. Blank stays blank, and so does anything
 * the Inventory module doesn't know (an old "Kilograms"): the picker can't show
 * it, and quietly reading it as Items would rewrite the unit on the next save.
 * Unit type is required for an Inventory asset, so the user is asked to pick.
 */
export function unitTypeFromApi(value: string | null | undefined): string {
  const needle = (value ?? "").trim().toLowerCase();
  if (!needle) return "";
  return UNIT_TYPES.find((option) => option.toLowerCase() === needle) ?? "";
}

export const DEPRECIATION_METHODS = [
  "Straight line",
  "Diminishing value",
  "Full depreciation on purchase",
] as const;
export type DepreciationMethod = (typeof DEPRECIATION_METHODS)[number];

export const ASSET_FILTERS = [
  "All",
  "Paid",
  "Owing",
  "Depreciating",
  "Matched",
  "Unmatched",
] as const;
export type AssetFilter = (typeof ASSET_FILTERS)[number];

export const ASSET_SORTS = [
  "Newest first",
  "Oldest first",
  "Highest value",
  "Lowest value",
  "Name A–Z",
] as const;
export type AssetSort = (typeof ASSET_SORTS)[number];

/**
 * One bank-transaction match on an asset — a journal entry reconciled against
 * it. An asset paid in instalments carries several, and each can be undone on
 * its own (`journal_entry_id` on the undo endpoint).
 */
export type AssetMatchedEntry = {
  journalEntryId: string;
  bankTransactionId: string | null;
  description: string;
  amount: number;
  /** ISO timestamp, or empty. */
  matchedAt: string;
};

/** A file kept with the asset — a photo, a receipt, or a supporting document. */
export type AssetFile = {
  /**
   * A data URL for a file just picked in this session, or the server's own
   * URL for one already uploaded — either is a valid `src`/`href`.
   */
  dataUrl: string;
  name: string;
  size: number;
  /** The server's document id, once uploaded. Undefined for a local pick. */
  id?: string;
};

/** Which of the four named slots a photo belongs to. */
export type AssetPhotoSlot = "photo" | "serial" | "receipt" | "marks";

export type AssetDepreciation = {
  enabled: boolean;
  method: DepreciationMethod;
  /** Years, as typed. */
  effectiveLife: string;
  /** Per cent, as typed. Overrides the rate the method would imply. */
  overrideRate: string;
  residualValue: string;
  costLimit: string;
  /** ISO `YYYY-MM-DD`. Defaults to the purchase date when left alone. */
  startDate: string;
};

/**
 * One insurance policy held against an asset.
 *
 * A list rather than a single record, because a vehicle can carry
 * comprehensive cover and a separate tools-in-transit policy, and the register
 * has to be able to show both.
 *
 * Amounts are strings, as typed — the same rule as `costPrice`. A figure kept as
 * a number can't hold "12,0" mid-keystroke, and rounding a premium on the way
 * into state is how a form starts arguing with the person filling it in.
 */
export type AssetInsurance = {
  id: string;
  insurerName: string;
  policyNumber: string;
  insurerEmail: string;
  brokerName: string;
  brokerPhone: string;
  /** As typed. */
  coverageAmount: string;
  /** As typed. */
  premiumAmount: string;
  /** ISO `YYYY-MM-DD`. */
  startDate: string;
  /** ISO `YYYY-MM-DD`. */
  endDate: string;
  notes: string;
};

let insuranceSeq = 0;

/** A blank policy with an id, ready for the inline form to fill in. */
export function newAssetInsurance(): AssetInsurance {
  insuranceSeq += 1;
  return {
    id: `insurance-${insuranceSeq}-${Date.now().toString(36)}`,
    insurerName: "",
    policyNumber: "",
    insurerEmail: "",
    brokerName: "",
    brokerPhone: "",
    coverageAmount: "",
    premiumAmount: "",
    startDate: "",
    endDate: "",
    notes: "",
  };
}

export type Asset = {
  id: string;
  name: string;
  category: AssetCategory;
  /** Null once the contact is deleted; `supplierName` is then the record. */
  supplierId: string | null;
  supplierName: string;
  /** As typed. Use `assetValue` for the figure. */
  costPrice: string;
  /** ISO `YYYY-MM-DD`. */
  purchaseDate: string;
  /** Whether `costPrice` already contains GST. */
  gst: boolean;
  paidWithCash: boolean;

  /* Inventory tracking — only meaningful while category is Inventory. */
  unitType: string;
  tracked: boolean;
  openingStock: string;
  lowStockAlert: string;
  /**
   * What the linked stock item sells for — filled into quote and invoice
   * lines when it's picked. Optional: blank leaves the item's own price as is
   * (0 for a new one).
   */
  salePrice?: string;
  /**
   * The `custom_product_service` row this asset is linked to, once one
   * exists — set by picking an existing tracked item from the asset-name
   * autocomplete. `null` until then, at which point saving with an
   * Inventory category creates a brand new linked product instead of
   * reusing the one that was picked.
   */
  inventoryProductId: string | null;

  /* More asset information. */
  brand: string;
  /** Free text against the registry's list rather than a fixed union. */
  assetType: string;
  modelNo: string;
  serialNo: string;
  identifyingMarks: string;
  warrantyExpiry: string;
  testAndTagDate: string;

  /* Photos, documents, depreciation and cover. */
  photos: Partial<Record<AssetPhotoSlot, AssetFile>>;
  documents: AssetFile[];
  depreciation: AssetDepreciation;
  /** Policies held against it. Empty until someone adds one. */
  insurance: AssetInsurance[];

  /* Disposal — sold, scrapped or written off. */
  /**
   * ISO `YYYY-MM-DD`, or empty while the asset is still held.
   *
   * The presence of this date *is* the disposal — see `isDisposed`. A separate
   * boolean would be a second source for the same fact, and the two would
   * eventually disagree.
   */
  disposedDate: string;
  /** What it went for, as typed. Empty for something scrapped or given away. */
  saleValue: string;

  /**
   * Reported lost, damaged or stolen — `null` while nothing's been reported,
   * or once it's marked returned. Read-only here for the register's badge;
   * the status screen (`fetchAssetStatus`) is the one place this changes.
   */
  statusReason: AssetStatusReason | null;

  /* Bank-transaction reconciliation — read-only; matching itself happens
   * through `lib/asset-match.ts`, not by writing these fields directly.
   *
   * `bank_transaction_id` on the asset row is *not* the signal: sole-ocr's
   * own match service explicitly nulls it back out once a match is made
   * (the real link lives in `reconciliation_records`/`journal_entries`
   * instead) — `is_reconciled` is the field that actually flips. Confirmed
   * against `services/v2/bankTransaction.js`'s `setMatchAssetsExpenses`. */
  /** Whether this asset's full cost has been reconciled against a bank transaction. */
  isReconciled: boolean;
  /** What's left to reconcile — 0 once fully matched. */
  remainingAmount: number;
  /** Unreconciled bank transactions within tolerance of the price — "AI Match" when > 0. */
  possibleMatchCount: number;
  /**
   * The bank matches behind `remainingAmount`, newest first — from the list
   * response only (`matched_journal_entries`); empty on the detail fetch.
   */
  matchedJournalEntries?: AssetMatchedEntry[];

  /**
   * The chart-of-accounts subcategory the asset was loaded with — `null` for
   * a new asset or one saved without an account. An update only sends a new
   * account when the category was changed in that edit (or there was none),
   * so an existing asset is never silently moved to a different account.
   */
  accountSubcategoryId: string | null;
};

/**
 * What the form edits. The category may be blank on a new asset — it has to
 * be chosen rather than defaulted, since it decides the account the cost
 * posts to.
 */
export type AssetDraft = Omit<Asset, "id" | "category"> & {
  category: AssetCategory | "";
};

export const MAX_DOCUMENTS = 5;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** GST is a component of the price, as on an expense — not added on top. */
export const GST_DIVISOR = 11;

/**
 * The GST inside a GST-inclusive figure at `ratePercent`: the figure divided by
 * (100 + rate) / rate. At 10% that divisor is exactly `GST_DIVISOR`, so
 * Australian figures are unchanged to the last bit; a 0% rate has nothing in it.
 */
function gstInside(total: number, ratePercent: number): number {
  return ratePercent > 0 ? total / ((100 + ratePercent) / ratePercent) : 0;
}

/**
 * Whether an asset can be edited from the register.
 *
 * Not once it is matched: what it cost is what the bank transaction was
 * reconciled against, so it shouldn't move without an undo first — the same
 * line the Expenses list draws, and sole-webapp's own ("This asset is already
 * reconciled and can't be edited"). The Edit action is left out for a matched
 * asset rather than shown disabled; View is still there, and so is Undo.
 *
 * Paid with cash counts as matched too — the register shows it with the same
 * Matched badge, and its cash payment is undone before an edit.
 */
export function canEditAsset(
  asset: Pick<Asset, "isReconciled" | "paidWithCash">,
): boolean {
  return !asset.isReconciled && !asset.paidWithCash;
}

export function assetValue(asset: Pick<Asset, "costPrice">): number {
  const value = Number(asset.costPrice.replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
}

/**
 * What's still unpaid on an asset.
 *
 * Worked out from what the books record:
 *
 * - Paid with cash: nothing owing.
 * - Otherwise what's left after the bank transactions matched to it —
 *   `remainingAmount`, which is the full price until a payment is matched.
 */
export function assetOwing(
  asset: Partial<Pick<Asset, "paidWithCash" | "remainingAmount">>,
): number {
  if (asset.paidWithCash) return 0;
  const remaining = Number(asset.remainingAmount);
  // Sub-cent residue from price − matched is rounding, not a debt.
  return Number.isFinite(remaining) && remaining >= 0.005 ? remaining : 0;
}

export function isPaid(
  asset: Partial<Pick<Asset, "paidWithCash" | "remainingAmount">>,
): boolean {
  return assetOwing(asset) === 0;
}

/**
 * The four figures the depreciation flow shows back as you fill it in.
 *
 * `rate` is null rather than 0 when it can't be worked out, so the panel can say
 * "N/A" instead of reporting a real rate of nothing.
 */
export type DepreciationPreview = {
  depreciableCost: number;
  openingBookValue: number;
  /** A fraction, not a percentage — 0.25 is 25%. Null when unanswerable. */
  rate: number | null;
  annualDepreciation: number;
  /**
   * Whether GST was taken out of the price to get here.
   *
   * The screen says so when it's true, because the figure it reports is then
   * lower than the price on the invoice and that difference needs explaining
   * rather than discovering.
   */
  exGst: boolean;
};

/**
 * The purchase price with GST taken out, or the price itself if it never
 * included any.
 *
 * A named helper because both the preview and the copy that explains the
 * preview need this figure, and `gstInside` is already the one place GST is
 * defined for an asset — the same arithmetic `gstBreakdown` does for the form's
 * subtotal line.
 */
export function assetExGstValue(
  asset: Pick<Asset, "costPrice" | "gst">,
  /** The business's GST/VAT rate, in percentage points. */
  ratePercent: number = 10,
): number {
  const value = assetValue(asset);
  return asset.gst ? value - gstInside(value, ratePercent) : value;
}

/**
 * IRD's general depreciation rates, with the estimated useful life each is set
 * for: [life in years, diminishing value %, straight line %] (IR265, assets
 * acquired from 21 May 2010). The same table sole-ocr's
 * `services/assetDepreciation.js` posts with (`NZ_RATE_TABLE`), so the preview
 * shows what will actually be claimed. Keep the two in step.
 */
export const NZ_DEPRECIATION_RATES: readonly (readonly [number, number, number])[] = [
  [2, 100, 100],
  [3, 67, 67],
  [4, 50, 40],
  [5, 40, 30],
  [6.66, 30, 21],
  [8, 25, 17.5],
  [10, 20, 13.5],
  [12.5, 16, 10.5],
  [15.5, 13, 8.5],
  [20, 10, 7],
  [25, 8, 6],
  [33.3, 6, 4],
  [50, 4, 3],
  [100, 2, 1.5],
];

/**
 * The yearly rate, as a fraction, an effective life gives — the rule the
 * backend applies when no rate is entered. Australia (and any other country):
 * straight line 1 ÷ life, diminishing value 200% of that. New Zealand: IRD's
 * published rate for the nearest life it publishes.
 */
export function rateFromLife(
  method: "Straight line" | "Diminishing value",
  life: number,
  countryIso2: string = "AU",
): number {
  if (countryIso2 === "NZ") {
    const [, dv, sl] = NZ_DEPRECIATION_RATES.reduce((best, row) =>
      Math.abs(row[0] - life) < Math.abs(best[0] - life) ? row : best,
    );
    return (method === "Straight line" ? sl : dv) / 100;
  }
  return method === "Straight line" ? 1 / life : 2 / life;
}

/** A typed figure as a number, floored at zero. Blank and rubbish both read 0. */
function typedAmount(value: string): number {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * What the settings on screen would actually do to this asset.
 *
 * Derived rather than stored: it's a restatement of the four fields above it, so
 * a saved copy is a copy that can disagree with them. Every branch is the same
 * shape — work out what can be depreciated, then how fast — which is what lets
 * one panel describe three methods.
 *
 * GST comes out first. A business registered for GST claims the GST back as a
 * credit, so it was never a cost — depreciating the inclusive price would claim
 * the same tax twice, once as a credit and again as a deduction. The cap
 * is applied to what's left, after that.
 *
 * The cost limit caps the base rather than replacing it: the ATO's car limit
 * says "you may claim up to this much", not "this asset cost that". A limit
 * above the price therefore changes nothing, which is why it's a `min` and not
 * an assignment.
 *
 * Residual only reduces the straight-line base. Diminishing value works off the
 * opening book value each year and converges towards nothing on its own, so
 * subtracting a salvage figure up front would be charging for it twice.
 */
export function depreciationPreview(
  asset: Pick<Asset, "costPrice" | "gst">,
  values: AssetDepreciation,
  /** The business's GST/VAT rate, in percentage points. */
  ratePercent: number = 10,
  /** The business's country: it decides the rate an effective life gives. */
  countryIso2: string = "AU",
): DepreciationPreview {
  const exGst = asset.gst;
  const base = assetExGstValue(asset, ratePercent);
  const limit = typedAmount(values.costLimit);
  const depreciableCost = limit > 0 ? Math.min(base, limit) : base;

  // The book value at the start of the first year is the whole depreciable
  // cost — nothing has been written off yet.
  const openingBookValue = depreciableCost;

  const residual = Math.min(typedAmount(values.residualValue), depreciableCost);
  const life = typedAmount(values.effectiveLife);
  const override = typedAmount(values.overrideRate);

  // Written off in one year, so the rate is the whole thing and the effective
  // life doesn't come into it.
  if (values.method === "Full depreciation on purchase") {
    return {
      depreciableCost,
      openingBookValue,
      rate: 1,
      annualDepreciation: depreciableCost,
      exGst,
    };
  }

  // Both remaining methods divide by the effective life. Without one there is
  // no rate to report, and no honest way to guess at it.
  if (life <= 0) {
    return {
      depreciableCost,
      openingBookValue,
      rate: null,
      annualDepreciation: 0,
      exGst,
    };
  }

  if (values.method === "Straight line") {
    if (countryIso2 === "NZ") {
      // IRD's straight-line rate, applied to cost less any residual — the same
      // base the backend's schedule writes off.
      const rate = rateFromLife("Straight line", life, countryIso2);
      return {
        depreciableCost,
        openingBookValue,
        rate,
        annualDepreciation: (depreciableCost - residual) * rate,
        exGst,
      };
    }
    return {
      depreciableCost,
      openingBookValue,
      rate: 1 / life,
      annualDepreciation: (depreciableCost - residual) / life,
      exGst,
    };
  }

  // Diminishing value: the ATO's 200% of the straight-line rate (IRD's
  // published rate in New Zealand), unless a rate has been entered by hand.
  const rate = override > 0 ? override / 100 : rateFromLife("Diminishing value", life, countryIso2);
  return {
    depreciableCost,
    openingBookValue,
    rate,
    annualDepreciation: rate * openingBookValue,
    exGst,
  };
}

/* ------------------------------------------------------------------ *
 * The schedule
 * ------------------------------------------------------------------ */

/** One year of the write-down. */
export type DepreciationYear = {
  /** 1-based — year one is the year the asset starts depreciating. */
  year: number;
  openingValue: number;
  depreciation: number;
  closingValue: number;
};

export type DepreciationSchedule = {
  /** The figures the setup page shows, so both surfaces agree. */
  preview: DepreciationPreview;
  years: DepreciationYear[];
  /** Ex-GST and cost-limit capped. Year one's opening value. */
  depreciableCost: number;
  /** Clamped into the depreciable cost — a salvage above cost is nonsense. */
  residual: number;
  /** Whole years between the start date and `today`, capped at the schedule. */
  elapsedYears: number;
  /** Written off so far. Never past `depreciableCost - residual`. */
  accumulated: number;
  /** What it's worth now. Never below the residual. */
  currentBookValue: number;
};

/**
 * A backstop on the number of rows.
 *
 * An effective life is typed by hand, and "100" is a plausible slip for "10".
 * Forty years is longer than any ATO determination, so a schedule that hits
 * this was never a real one.
 */
const MAX_SCHEDULE_YEARS = 40;

/**
 * Whole years from `fromIso` to `toIso`, floored at zero.
 *
 * String arithmetic rather than `Date`, for the same reason the period helpers
 * compare ISO strings: parsing two dates to subtract them invites the timezone
 * bug where an anniversary lands a day early. An anniversary that hasn't come
 * round yet doesn't count, which is the `< `comparison on the month and day.
 */
function wholeYearsBetween(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0;
  const fromYear = Number(fromIso.slice(0, 4));
  const toYear = Number(toIso.slice(0, 4));
  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) return 0;

  const anniversaryPassed = toIso.slice(5) >= fromIso.slice(5);
  return Math.max(0, toYear - fromYear - (anniversaryPassed ? 0 : 1));
}

/**
 * The write-down, year by year.
 *
 * Built on `depreciationPreview` rather than beside it, so the setup page's
 * four figures and this table can't disagree about what the depreciable cost
 * is or what rate applies to it.
 *
 * Every year is the same three steps: what's left above the residual, what the
 * method would take, and the smaller of the two. That last `min` is what makes
 * the floor hold without a special case per method — a diminishing-value rate
 * on a nearly-written-down asset would otherwise dip below the salvage figure,
 * and a full write-off would ignore it entirely.
 *
 * Nothing here can go negative. The cost is floored at zero before the loop,
 * the residual is clamped into it, each year's depreciation is clamped into
 * what remains, and the accumulated total is capped at the whole depreciable
 * amount — so a nonsensical set of inputs produces a short schedule or an empty
 * one, never a negative figure presented as a deduction.
 */
export function depreciationSchedule(
  asset: Pick<Asset, "costPrice" | "gst">,
  values: AssetDepreciation,
  /** ISO date treated as now, so "accumulated so far" is testable. */
  today = "",
  /** The business's GST/VAT rate, in percentage points. */
  ratePercent: number = 10,
): DepreciationSchedule {
  const preview = depreciationPreview(asset, values, ratePercent);
  const depreciableCost = Math.max(0, preview.depreciableCost);
  const residual = Math.min(
    Math.max(0, typedAmount(values.residualValue)),
    depreciableCost,
  );
  const life = Math.floor(typedAmount(values.effectiveLife));

  /*
   * How many rows to run. A full write-off is one year by definition; the other
   * two run for the effective life, which is also the only thing that stops the
   * loop for a diminishing-value asset — that curve approaches the residual
   * without ever arriving.
   */
  const span =
    values.method === "Full depreciation on purchase"
      ? 1
      : Math.min(Math.max(life, 0), MAX_SCHEDULE_YEARS);

  const years: DepreciationYear[] = [];
  let opening = depreciableCost;

  for (let year = 1; year <= span; year += 1) {
    // Nothing below the residual is depreciable, so this is the ceiling on
    // what any method can take this year.
    const remaining = Math.max(0, opening - residual);
    if (remaining <= 0) break;

    let claimed: number;
    if (values.method === "Full depreciation on purchase") {
      claimed = depreciableCost;
    } else if (values.method === "Straight line") {
      claimed = life > 0 ? (depreciableCost - residual) / life : 0;
    } else {
      // Diminishing value works off this year's opening value, not the first
      // year's — which is the whole difference between the two methods.
      claimed = (preview.rate ?? 0) * opening;
    }

    const depreciation = Math.min(Math.max(0, claimed), remaining);
    if (depreciation <= 0) break;

    const closingValue = opening - depreciation;
    years.push({ year, openingValue: opening, depreciation, closingValue });
    opening = closingValue;
  }

  /*
   * Accumulated *so far*, not over the whole schedule: the card beside this
   * table reports a current book value, and a total that ran to the end of the
   * life would report every asset as already written down to its salvage value.
   */
  const elapsedYears = Math.min(
    wholeYearsBetween(values.startDate, today),
    years.length,
  );
  const writeOffCeiling = Math.max(0, depreciableCost - residual);
  const accumulated = Math.min(
    years
      .slice(0, elapsedYears)
      .reduce((sum, row) => sum + row.depreciation, 0),
    writeOffCeiling,
  );

  return {
    preview,
    years,
    depreciableCost,
    residual,
    elapsedYears,
    accumulated,
    currentBookValue: Math.max(residual, depreciableCost - accumulated),
  };
}

/**
 * Whether this asset has been disposed of.
 *
 * The date is the record, so this is the one question to ask rather than
 * checking the field at each call site — the register's badge, the disposal
 * page and anything that has to stop depreciating a sold asset all mean the
 * same thing by "disposed".
 */
export function isDisposed(asset: Pick<Asset, "disposedDate">): boolean {
  return !!asset.disposedDate;
}

/** The three lines the GST summary shows, from one typed figure. */
export function gstBreakdown(
  costPrice: string,
  includesGst: boolean,
  ratePercent: number = 10,
) {
  const total = assetValue({ costPrice });
  const gst = includesGst ? gstInside(total, ratePercent) : 0;
  return { subTotal: total - gst, gst, total };
}

export type AssetStats = {
  totalValue: number;
  paidValue: number;
  owingValue: number;
  depreciatingCount: number;
  paidCount: number;
  owingCount: number;
};

export function assetStats(assets: Asset[]): AssetStats {
  // A disposed asset is no longer held or depreciating, so it stays out of the
  // value and the depreciating count — but anything still owed on it is owed.
  const held = assets.filter((asset) => !isDisposed(asset));
  const totalValue = held.reduce((sum, asset) => sum + assetValue(asset), 0);
  const heldOwing = held.reduce((sum, asset) => sum + assetOwing(asset), 0);
  const owingValue = assets.reduce((sum, asset) => sum + assetOwing(asset), 0);
  return {
    totalValue,
    // What's actually yours: the value less anything still financed.
    paidValue: totalValue - heldOwing,
    owingValue,
    depreciatingCount: held.filter((asset) => asset.depreciation.enabled)
      .length,
    paidCount: assets.filter(isPaid).length,
    owingCount: assets.filter((asset) => !isPaid(asset)).length,
  };
}

/* ------------------------------------------------------------------ *
 * Advanced filters — the "Filter by" popover
 * ------------------------------------------------------------------ */

export const ASSET_MATCH_STATUSES = ["All", "Matched", "Unmatched"] as const;
export type AssetMatchStatus = (typeof ASSET_MATCH_STATUSES)[number];

/**
 * What the "Filter by" dialog narrows by, on top of the toolbar's search.
 *
 * These are sent to the server as `filter_by` (see `assetFiltersToApi`), not
 * applied in the browser — the same contract the original web app's asset list
 * used, so both screens ask the backend the same question.
 *
 * `minValue`/`maxValue` are null while that end of the range is left open, not
 * 0 and "the biggest asset": the slider's ceiling is worked out from whatever
 * is on the register right now, so an end pinned to it would quietly exclude
 * an asset bought at a higher price a minute later.
 */
export type AssetAdvancedFilters = {
  paidWithCashOnly: boolean;
  match: AssetMatchStatus;
  /** ISO `YYYY-MM-DD`, inclusive. Empty leaves that end open. */
  dateFrom: string;
  dateTo: string;
  minValue: number | null;
  maxValue: number | null;
  /**
   * Chart-of-accounts subcategory ids under "Assets" — what the register's
   * Category column shows and what `account_subcategory_id` filters on.
   * Empty means every category, not none.
   */
  categories: string[];
};

export const EMPTY_ASSET_ADVANCED_FILTERS: AssetAdvancedFilters = {
  paidWithCashOnly: false,
  match: "All",
  dateFrom: "",
  dateTo: "",
  minValue: null,
  maxValue: null,
  categories: [],
};

/** How many of the popover's filters are narrowing anything, for its badge. */
export function assetAdvancedFilterCount(
  filters: AssetAdvancedFilters,
): number {
  let count = 0;
  if (filters.paidWithCashOnly) count += 1;
  if (filters.match !== "All") count += 1;
  if (filters.dateFrom || filters.dateTo) count += 1;
  if (filters.minValue != null || filters.maxValue != null) count += 1;
  if (filters.categories.length > 0) count += 1;
  return count;
}

/**
 * The slider's upper end: the dearest asset, rounded up to a figure that gives
 * the thumb a sensible step. Never below 1,000, so a register of three cheap
 * assets doesn't get a slider a few dollars wide.
 */
export function assetValueCeiling(assets: Pick<Asset, "costPrice">[]): number {
  const top = assets.reduce((max, asset) => Math.max(max, assetValue(asset)), 0);
  if (top <= 1000) return 1000;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(top)) - 1);
  return Math.ceil(top / magnitude) * magnitude;
}

/**
 * The `filter_by` object `GET /assets` reads, from the dialog's filters.
 *
 * Only what's actually narrowing is included, so an unfiltered register sends
 * no `filter_by` at all: the endpoint tests `paid_with_cash` for truthiness, so
 * a `0` would be read the same as a `1` if it were ever sent.
 */
export function assetFiltersToApi(
  filters: AssetAdvancedFilters,
): Record<string, unknown> {
  const api: Record<string, unknown> = {};
  if (filters.paidWithCashOnly) api.paid_with_cash = 1;
  if (filters.match === "Matched") api.match_status = "matched";
  if (filters.match === "Unmatched") api.match_status = "unmatched";
  if (filters.dateFrom) api.start_date = filters.dateFrom;
  if (filters.dateTo) api.end_date = filters.dateTo;
  if (filters.minValue != null) api.min_price = filters.minValue;
  if (filters.maxValue != null) api.max_price = filters.maxValue;
  const subcategories = filters.categories
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (subcategories.length > 0) api.account_subcategory_id = subcategories;
  return api;
}

/** Whether anything is narrowing the list, which decides the empty copy. */
export function assetsNarrowed({
  query,
  filter,
  advanced,
}: {
  query: string;
  filter?: AssetFilter;
  advanced?: AssetAdvancedFilters;
}): boolean {
  return (
    !!query.trim() ||
    (filter ?? "All") !== "All" ||
    (advanced ? assetAdvancedFilterCount(advanced) > 0 : false)
  );
}

export function filterAssets(
  assets: Asset[],
  {
    query,
    filter,
    sort,
  }: {
    query: string;
    /** The retired toolbar dropdown's choice; omitted, it's "All". */
    filter?: AssetFilter;
    sort: AssetSort;
  },
): Asset[] {
  const needle = query.trim().toLowerCase();

  const matches = assets.filter((asset) => {
    if (filter === "Paid" && !isPaid(asset)) return false;
    if (filter === "Owing" && isPaid(asset)) return false;
    if (filter === "Depreciating" && !asset.depreciation.enabled) return false;
    if (filter === "Matched" && !asset.isReconciled) return false;
    if (filter === "Unmatched" && asset.isReconciled) return false;
    if (!needle) return true;
    return (
      asset.name.toLowerCase().includes(needle) ||
      asset.supplierName.toLowerCase().includes(needle) ||
      asset.category.toLowerCase().includes(needle)
    );
  });

  const sorted = [...matches];
  sorted.sort((a, b) => {
    switch (sort) {
      case "Oldest first":
        return a.purchaseDate.localeCompare(b.purchaseDate);
      case "Highest value":
        return assetValue(b) - assetValue(a);
      case "Lowest value":
        return assetValue(a) - assetValue(b);
      case "Name A–Z":
        return a.name.localeCompare(b.name);
      default:
        return b.purchaseDate.localeCompare(a.purchaseDate);
    }
  });
  return sorted;
}

/** dd/mm/yyyy, as every other list screen prints a date. */
export function formatAssetDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

export function assetMoney(value: number): string {
  return invoiceMoney(value);
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export type AssetIssue = { key: string; message: string };

/**
 * Which step each required field belongs to, so the wizard can send you back to
 * the one that's incomplete rather than reporting an error you can't see.
 */
export const ASSET_STEP_FIELDS: string[][] = [
  ["name", "costPrice", "purchaseDate", "supplier", "category", "unitType", "salePrice"],
  ["brand", "assetType"],
  [],
  ["effectiveLife", "overrideRate", "residualValue", "costLimit"],
];

export function assetIssues(
  draft: AssetDraft,
  /** The business's GST/VAT rate, in percentage points — for the ex-GST cap. */
  gstRatePercent: number = 10,
  /**
   * `advanced: false` is a plan without Advanced Assets: its form has no
   * Details or Depreciation step (old AddAssets: Asset + Photos only), so make,
   * type and depreciation are neither asked nor checked.
   */
  options: { advanced?: boolean } = {},
): AssetIssue[] {
  const advanced = options.advanced !== false;
  const issues: AssetIssue[] = [];
  const require = (key: string, value: string, message: string) => {
    if (!value.trim()) issues.push({ key, message });
  };

  require("name", draft.name, "Name this asset.");

  const price = amountError(draft.costPrice);
  if (price) {
    issues.push({ key: "costPrice", message: price });
  } else if (!draft.costPrice.trim() || assetValue(draft) <= 0) {
    issues.push({ key: "costPrice", message: "Enter what it cost." });
  }

  require("purchaseDate", draft.purchaseDate, "When was it bought?");
  if (!draft.supplierName.trim()) {
    issues.push({ key: "supplier", message: "Who did you buy it from?" });
  } else if (!draft.supplierId) {
    // A name with no contact behind it (an OCR reading, say) would save with
    // no supplier at all — the backend only keeps `client_id`.
    issues.push({
      key: "supplier",
      message: "Pick the supplier from your contacts, or add it.",
    });
  }
  require("category", draft.category, "Pick a category.");

  // Only asked for once the category is the one that carries stock.
  if (draft.category === TRACKED_CATEGORY) {
    require("unitType", draft.unitType, "Pick a unit type.");
    const salePrice = amountError(draft.salePrice ?? "");
    if (salePrice) {
      issues.push({ key: "salePrice", message: salePrice });
    }
  }

  if (!advanced) return issues;

  require("brand", draft.brand, "Enter the make or brand.");
  require("assetType", draft.assetType, "Pick an asset type.");

  // The depreciation screen's rules: an effective life of at least six months
  // (none for a full write-off), an override rate only for diminishing value,
  // residual and cost limit 0 or more and no more than the ex-GST cost. The cap
  // is skipped while the cost itself is missing — that has its own issue on
  // step one.
  if (draft.depreciation.enabled) {
    const errors = depreciationErrors(draft.depreciation, {
      assetValue:
        assetValue(draft) > 0 ? assetExGstValue(draft, gstRatePercent) : null,
      fullWriteOff: draft.depreciation.method === "Full depreciation on purchase",
      overrideRateApplies: draft.depreciation.method === "Diminishing value",
    });
    for (const key of [
      "effectiveLife",
      "overrideRate",
      "residualValue",
      "costLimit",
    ] as const) {
      const message = errors[key];
      if (message) issues.push({ key, message });
    }
  }

  return issues;
}

/** The first step still carrying an issue, or null when the draft is complete. */
export function firstIncompleteStep(issues: AssetIssue[]): number | null {
  if (issues.length === 0) return null;
  const keys = new Set(issues.map((issue) => issue.key));
  for (const [index, fields] of ASSET_STEP_FIELDS.entries()) {
    if (fields.some((field) => keys.has(field))) return index;
  }
  return null;
}

export const EMPTY_DEPRECIATION: AssetDepreciation = {
  enabled: false,
  method: "Straight line",
  effectiveLife: "",
  overrideRate: "",
  residualValue: "",
  costLimit: "",
  startDate: "",
};

export function emptyAssetDraft(today: string): AssetDraft {
  return {
    name: "",
    // Chosen, not defaulted: it decides which account the cost posts to.
    category: "",
    supplierId: null,
    supplierName: "",
    costPrice: "",
    purchaseDate: today,
    gst: true,
    paidWithCash: false,
    unitType: "",
    tracked: false,
    openingStock: "",
    lowStockAlert: "",
    salePrice: "",
    inventoryProductId: null,
    brand: "",
    // Empty, not "New": the first entry of a list is not a default, and a form
    // that answers a required question for you gets that answer saved.
    assetType: "",
    modelNo: "",
    serialNo: "",
    identifyingMarks: "",
    warrantyExpiry: "",
    testAndTagDate: "",
    photos: {},
    documents: [],
    depreciation: { ...EMPTY_DEPRECIATION },
    insurance: [],
    disposedDate: "",
    saleValue: "",
    statusReason: null,
    isReconciled: false,
    remainingAmount: 0,
    possibleMatchCount: 0,
    matchedJournalEntries: [],
    accountSubcategoryId: null,
  };
}

/* ------------------------------------------------------------------ *
 * Document capture
 * ------------------------------------------------------------------ */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * What capture claims to have read off the document, and how sure it is.
 *
 * Limited to what `/assets/extract` actually returns (name, price, date,
 * supplier, category, serial no., warranty expiry) — it has no read on brand,
 * asset type or model number, so those stay for the person to fill in rather
 * than a field this type would promise capture can supply.
 */
export type AssetExtraction = {
  /** 0–1. Below LOW_CONFIDENCE the pill warns rather than reassures. */
  confidence: number;
  fields: Pick<
    AssetDraft,
    | "name"
    | "category"
    | "supplierName"
    | "costPrice"
    | "purchaseDate"
    | "serialNo"
    | "warrantyExpiry"
    | "gst"
  >;
};

/** Under this, the reading is worth a second look before it's trusted. */
export const LOW_CONFIDENCE = 0.8;

export function assetStatsCards(stats: AssetStats) {
  return {
    totalValue: assetMoney(stats.totalValue),
    paidValue: assetMoney(stats.paidValue),
    owingValue: assetMoney(stats.owingValue),
    depreciating: String(stats.depreciatingCount),
  };
}

/* ------------------------------------------------------------------ *
 * Backend wiring — sole-ocr's /assets, /asset-registry and
 * /asset-insurance resources.
 *
 * There is no "still owing" field: the `assets` table has no column for it
 * (and the old app never had one). What an asset still owes is derived in
 * `assetOwing`, from `paid_with_cash` and the matched-payment `remainingAmount`
 * the list response carries.
 *
 * Bank-transaction reconciliation (`isReconciled`/`remainingAmount`/
 * `possibleMatchCount`) is read-only from this module — mapped straight
 * through off the list response for display, but *setting* a match is
 * `lib/asset-match.ts`'s job (`/v2/bank-transaction/match-asset-expense`),
 * not this module's.
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

const DEPRECIATION_METHOD_TO_API: Record<
  DepreciationMethod,
  "straight_line" | "diminishing_value" | "full_depreciation"
> = {
  "Straight line": "straight_line",
  "Diminishing value": "diminishing_value",
  "Full depreciation on purchase": "full_depreciation",
};

const DEPRECIATION_METHOD_FROM_API: Record<string, DepreciationMethod> = {
  straight_line: "Straight line",
  diminishing_value: "Diminishing value",
  full_depreciation: "Full depreciation on purchase",
};

export function depreciationMethodFromApi(value: string | null): DepreciationMethod {
  return (value && DEPRECIATION_METHOD_FROM_API[value]) || "Straight line";
}

/** A category name from the fixed list, case-insensitively — or undefined. */
function matchCategory(value: string | null | undefined): AssetCategory | undefined {
  const needle = (value ?? "").trim().toLowerCase();
  return ASSET_CATEGORIES.find((category) => category.toLowerCase() === needle);
}

/** Matches a category name against the fixed list, case-insensitively. */
export function categoryFromApi(value: string | null): AssetCategory {
  return matchCategory(value) ?? "Other";
}

/**
 * The category a saved asset reads back as.
 *
 * A linked stock item makes it Inventory whatever else is stored — reading it
 * as anything else would save it without `is_inventory_category`, and the
 * backend soft-deletes the stock item behind an asset that's no longer
 * Inventory. Then the stored category if it's one of ours; an older asset
 * holds null or a type name ("Laptop") there, so its account decides instead.
 */
export function categoryForApiAsset(raw: {
  inventory_product_id?: number | string | null;
  asset_category?: string | null;
  subcategory_name?: string | null;
  account_subcategory?: { name?: string | null } | null;
}): AssetCategory {
  if (raw.inventory_product_id != null && raw.inventory_product_id !== "") {
    return "Inventory";
  }
  return (
    matchCategory(raw.asset_category) ??
    categoryFromAccountName(raw.account_subcategory?.name ?? raw.subcategory_name)
  );
}

/** The registry entry whose name matches `query` exactly, case-insensitively. */
export function registryEntryByName(
  entries: AssetRegistryEntry[],
  query: string,
): AssetRegistryEntry | undefined {
  const needle = query.trim().toLowerCase();
  if (!needle) return undefined;
  return entries.find((entry) => entry.name.toLowerCase() === needle);
}

function registryNameById(
  id: number | string | null | undefined,
  entries: AssetRegistryEntry[],
): string {
  if (id === null || id === undefined || id === "") return "";
  const numeric = Number(id);
  return entries.find((entry) => entry.id === numeric)?.name ?? "";
}

/** The registry's brands and types, as the mapper and form builder need them. */
export type AssetRegistrySnapshot = {
  brands: AssetRegistryEntry[];
  types: AssetRegistryEntry[];
};

/**
 * A raw `/assets` row, list or detail — the fields below are the union of
 * both: `getAssets` (list) and `assetDetails` (single) share this shape,
 * a field simply comes back `undefined` on whichever endpoint doesn't select
 * it. `mapApiAssetToAsset` reads both through the same optional-safe path.
 */
type ApiAssetDocument = { id: number | string; file_path: string; file_name: string };

type ApiMatchedJournalEntry = {
  journal_entry_id?: number | string | null;
  bank_transaction_id?: number | string | null;
  transaction_description?: string | null;
  matched_amount?: number | string | null;
  matched_at?: string | null;
};

type ApiAsset = {
  asset_id?: number | string;
  id?: number | string;
  client_id?: number | string | null;
  client?: { client_id?: number | string | null; name?: string | null; business_name?: string | null } | null;
  name: string;
  gst?: number | boolean | null;
  price?: number | string | null;
  asset_photo_url?: string | null;
  serial_no_photo_url?: string | null;
  receipt_photo_url?: string | null;
  identifiable_marks_photo_url?: string | null;
  date_of_purchase?: string | null;
  paid_with_cash?: number | boolean | null;
  bank_transaction_id?: number | string | null;
  is_reconciled?: number | boolean | null;
  /** Deliberately camelCase in the raw response — confirmed against `getAssets`. */
  remainingAmount?: number | string | null;
  possible_match?: number | string | null;
  inventory_product_id?: number | string | null;
  account_subcategory_id?: number | string | null;
  subcategory_name?: string | null;
  account_subcategory?: { name?: string | null } | null;
  /** List response only — every journal entry reconciled against the asset. */
  matched_journal_entries?: ApiMatchedJournalEntry[] | null;
  documents?: ApiAssetDocument[];
  /**
   * Lost/damaged/stolen *and* disposal share one row (`AssetStatus`) — a
   * disposal-only record has `status_type: null` and just `disposed_date`/
   * `sale_value` set. Confirmed in `assetStatus.js`'s `createDisposal`.
   */
  asset_status?: {
    status_type?: string | null;
    is_returned?: number | boolean | null;
    disposed_date?: string | null;
    sale_value?: number | string | null;
  } | null;
  asset_category?: string | null;
  asset_brand_id?: number | string | null;
  asset_type_id?: number | string | null;
  asset_type?: string | null;
  model_no?: string | null;
  serial_no?: string | null;
  identifiable_marks?: string | null;
  warranty_date?: string | null;
  test_and_tag_date?: string | null;
  inventory_flag?: number | boolean | null;
  qty_type?: string | null;
  inventory_count?: number | string | null;
  low_stock_threshold?: number | string | null;
  /** The linked stock item's sale price. */
  selling_price?: number | string | null;
  is_depreciation?: number | boolean | null;
  depreciation_method?: string | null;
  effective_life_years?: number | string | null;
  depreciation_rate?: number | string | null;
  residual_value?: number | string | null;
  cost_limit?: number | string | null;
  depreciation_start_date?: string | null;
};

/**
 * A saved photo slot's display name, with the extension of the stored file —
 * the receipt slot takes PDFs, and naming one `receipt.jpg` made the preview
 * treat it as an image. Falls back to `.jpg` when the URL carries none.
 */
export function savedPhotoName(slot: AssetPhotoSlot, url: string): string {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  const extension = /\.([a-z0-9]{1,5})$/i.exec(path)?.[1];
  return `${slot}.${extension ? extension.toLowerCase() : "jpg"}`;
}

/** A backend row, as the `Asset` every screen in this module reads. */
function mapApiAssetToAsset(
  raw: ApiAsset,
  registry: AssetRegistrySnapshot,
): Asset {
  const id = String(raw.asset_id ?? raw.id ?? "");
  const tracked = Boolean(Number(raw.inventory_flag));
  const priceValue = Number(raw.price);

  const photos: Partial<Record<AssetPhotoSlot, AssetFile>> = {};
  const photoUrl = (slot: AssetPhotoSlot, url: string | null | undefined) => {
    if (url) photos[slot] = { dataUrl: url, name: savedPhotoName(slot, url), size: 0 };
  };
  photoUrl("photo", raw.asset_photo_url);
  photoUrl("serial", raw.serial_no_photo_url);
  photoUrl("receipt", raw.receipt_photo_url);
  photoUrl("marks", raw.identifiable_marks_photo_url);

  const documents: AssetFile[] = (raw.documents ?? []).map((doc) => ({
    id: String(doc.id),
    dataUrl: doc.file_path,
    name: doc.file_name,
    size: 0,
  }));

  return {
    id,
    name: raw.name ?? "",
    category: categoryForApiAsset(raw),
    supplierId: raw.client_id != null ? String(raw.client_id) : null,
    supplierName: raw.client?.business_name || raw.client?.name || "",
    costPrice: Number.isFinite(priceValue) && priceValue > 0 ? String(priceValue) : "",
    purchaseDate: raw.date_of_purchase ?? "",
    gst: Boolean(Number(raw.gst)),
    paidWithCash: Boolean(Number(raw.paid_with_cash)),

    // Read whenever there's a linked stock item, tracked or not: an untracked
    // Inventory asset still needs its unit to pass validation on the next save.
    unitType: unitTypeFromApi(raw.qty_type),
    tracked,
    openingStock: tracked ? String(Number(raw.inventory_count) || 0) : "",
    lowStockAlert: tracked ? String(Number(raw.low_stock_threshold) || 0) : "",
    salePrice:
      Number(raw.selling_price) > 0 ? String(Number(raw.selling_price)) : "",
    inventoryProductId:
      raw.inventory_product_id != null ? String(raw.inventory_product_id) : null,

    brand: registryNameById(raw.asset_brand_id, registry.brands),
    assetType:
      registryNameById(raw.asset_type_id, registry.types) || raw.asset_type || "",
    modelNo: raw.model_no ?? "",
    serialNo: raw.serial_no ?? "",
    identifyingMarks: raw.identifiable_marks ?? "",
    warrantyExpiry: raw.warranty_date ?? "",
    testAndTagDate: raw.test_and_tag_date ?? "",

    photos,
    documents,
    depreciation: {
      enabled: Boolean(Number(raw.is_depreciation)),
      method: depreciationMethodFromApi(raw.depreciation_method ?? null),
      effectiveLife:
        raw.effective_life_years != null ? String(raw.effective_life_years) : "",
      overrideRate: raw.depreciation_rate != null ? String(raw.depreciation_rate) : "",
      residualValue: raw.residual_value != null ? String(raw.residual_value) : "",
      costLimit: raw.cost_limit != null ? String(raw.cost_limit) : "",
      startDate: raw.depreciation_start_date ?? "",
    },
    // Not on the list/detail response — the insurance screen loads its own
    // records for one asset via `fetchAssetInsurance` instead.
    insurance: [],
    disposedDate: raw.asset_status?.disposed_date ?? "",
    saleValue: raw.asset_status?.sale_value != null ? String(raw.asset_status.sale_value) : "",

    // Returned means no longer actively reported, whatever status_type still says.
    statusReason:
      raw.asset_status?.status_type && !Boolean(Number(raw.asset_status.is_returned))
        ? (STATUS_REASON_FROM_API[raw.asset_status.status_type] ?? null)
        : null,

    isReconciled: Boolean(Number(raw.is_reconciled)),
    remainingAmount: raw.remainingAmount != null ? Number(raw.remainingAmount) : 0,
    possibleMatchCount: Number(raw.possible_match) || 0,
    matchedJournalEntries: (raw.matched_journal_entries ?? [])
      .filter((entry) => Number(entry.journal_entry_id) > 0)
      .map((entry) => ({
        journalEntryId: String(entry.journal_entry_id),
        bankTransactionId:
          entry.bank_transaction_id != null ? String(entry.bank_transaction_id) : null,
        description: entry.transaction_description ?? "",
        amount: Number(entry.matched_amount) || 0,
        matchedAt: entry.matched_at ?? "",
      })),
    accountSubcategoryId:
      raw.account_subcategory_id != null && raw.account_subcategory_id !== ""
        ? String(raw.account_subcategory_id)
        : null,
  };
}

/**
 * Reconstructs the picked `File` behind a data URL, so a freshly chosen photo
 * or document can be appended to `FormData` without ever changing `AssetFile`
 * itself (which stays a plain, serialisable `{dataUrl, name, size}` used for
 * display everywhere else).
 */
async function fileFromDataUrl(file: AssetFile): Promise<File> {
  const blob = await fetch(file.dataUrl).then((response) => response.blob());
  return new File([blob], file.name, { type: blob.type });
}

/** A file just picked in this session, never one already sitting on the server. */
function isFreshFile(file: AssetFile | undefined): file is AssetFile {
  return !!file && file.dataUrl.startsWith("data:");
}

/**
 * The chart-of-accounts subcategory a category's cost posts to: the user's own
 * "Assets → …" account named in `ASSET_CATEGORY_ACCOUNTS`, found the same way
 * the Inventory form finds "Inventory". Falls back to "Other Assets" when the
 * named account isn't on the user's chart, and to `null` (nothing sent) when
 * that isn't either — without an account the backend can't post the journal,
 * so sending one is what lets "Paid with cash" save at all.
 */
export async function resolveAssetAccountSubcategoryId(
  category: AssetCategory | "",
): Promise<number | null> {
  if (!category) return null;
  const named = await resolveAssetSubcategoryIdByName(
    ASSET_CATEGORY_ACCOUNTS[category],
  );
  if (named != null) return named;
  return resolveAssetSubcategoryIdByName(FALLBACK_ASSET_ACCOUNT);
}

/**
 * Whether an update should (re)resolve the asset's account from its category.
 *
 * Only when the category was changed in this edit, or the asset was never
 * given an account — otherwise an existing asset keeps whatever account it
 * was filed under, even if the mapping has moved on since.
 */
export function shouldResolveAccountOnUpdate(
  draft: Pick<AssetDraft, "category">,
  original: Pick<Asset, "category" | "accountSubcategoryId">,
): boolean {
  return draft.category !== original.category || !original.accountSubcategoryId;
}

/**
 * Builds the multipart body `/assets/create` and `/assets/update` both
 * expect, per the field mapping confirmed against sole-webapp's own submit
 * handler (`AddAssets.js`) — not the raw Sequelize columns, some of which
 * that endpoint doesn't actually read.
 *
 * A photo slot is only appended when it's a freshly picked file
 * (`isFreshFile`) — on update, leaving an existing photo's field out of the
 * form entirely is what keeps it in place; a saved slot the user removed is
 * cleared with `remove_photos` (see `removedPhotoFields`), on update only.
 * Documents are only attached inline on create — an update's new documents
 * go through `attachAssetDocumentApi` instead, the same split sole-webapp's
 * own form makes.
 *
 * Without Advanced Assets (`advanced: false`) the form has no Details or
 * Depreciation step and only the asset photo slot, so none of those fields
 * are sent — an OCR-read serial or warranty date would otherwise be saved
 * from fields the user never saw. On update, leaving them out keeps the
 * stored values.
 */
/** Each photo slot and the `/assets/create|update` field that carries it. */
const PHOTO_FIELDS: [AssetPhotoSlot, string][] = [
  ["photo", "asset_photo"],
  ["serial", "serial_no_photo"],
  ["receipt", "receipt_photo"],
  ["marks", "identifiable_marks_photo"],
];

/**
 * The saved photo slots this edit removed, as the field names `/assets/update`
 * clears through `remove_photos`. Leaving a field out keeps the stored photo,
 * so a slot the user emptied has to be named. A slot holding a new file is
 * replaced by the upload instead; on the basic plan only the asset photo slot
 * is on the form, so only it can have been removed.
 */
export function removedPhotoFields(
  saved: Partial<Record<AssetPhotoSlot, AssetFile>>,
  draft: Partial<Record<AssetPhotoSlot, AssetFile>>,
  advanced = true,
): string[] {
  return PHOTO_FIELDS.filter(
    ([slot]) => (advanced || slot === "photo") && saved[slot] && !draft[slot],
  ).map(([, field]) => field);
}

async function assetDraftToFormData(
  draft: AssetDraft,
  registry: AssetRegistrySnapshot,
  mode: "create" | "update",
  /** False leaves `account_subcategory_id` out, keeping the stored account. */
  resolveAccount = true,
  advanced = true,
): Promise<FormData> {
  const form = new FormData();

  form.append("name", draft.name.trim());
  form.append("price", String(assetValue(draft)));
  form.append("date_of_purchase", draft.purchaseDate);
  form.append("gst", draft.gst ? "1" : "0");
  form.append("paid_with_cash", draft.paidWithCash ? "1" : "0");
  form.append("client_id", draft.supplierId ?? "");
  form.append("client_name", draft.supplierName.trim());

  const accountSubcategoryId = resolveAccount
    ? await resolveAssetAccountSubcategoryId(draft.category)
    : null;
  if (accountSubcategoryId != null) {
    form.append("account_subcategory_id", String(accountSubcategoryId));
  }

  const tracked = draft.category === TRACKED_CATEGORY && draft.tracked;
  if (draft.category === TRACKED_CATEGORY) {
    form.append("is_inventory_category", "1");
    form.append("is_inventory", tracked ? "1" : "0");
    form.append("inventory_flag", tracked ? "1" : "0");
    // The linked stock item's own vocabulary, so the Inventory screen can read it.
    form.append("qty_type", unitTypeToApi(draft.unitType));
    form.append("inventory_count", String(tracked ? Number(draft.openingStock) || 0 : 0));
    form.append(
      "low_stock_threshold",
      String(tracked ? Number(draft.lowStockAlert) || 0 : 0),
    );
    // Blank sends nothing, so an existing item's own sale price is kept.
    const salePrice = (draft.salePrice ?? "").replace(/,/g, "").trim();
    if (salePrice) {
      form.append("selling_price", String(Number(salePrice)));
    }
    // Links to an existing product instead of letting the backend create a
    // second, duplicate one behind this asset — set when a suggestion from
    // the asset-name autocomplete already had one.
    if (draft.inventoryProductId) {
      form.append("inventory_product_id", draft.inventoryProductId);
    }
  }

  form.append("asset_category", draft.category);
  if (advanced) {
    const brand = registryEntryByName(registry.brands, draft.brand);
    if (brand) form.append("asset_brand_id", String(brand.id));
    const assetType = registryEntryByName(registry.types, draft.assetType);
    if (assetType) form.append("asset_type_id", String(assetType.id));
    form.append("model_no", draft.modelNo || "");
    form.append("serial_no", draft.serialNo || "");
    form.append("identifiable_marks", draft.identifyingMarks || "");
    if (draft.warrantyExpiry) form.append("warranty_date", draft.warrantyExpiry);
    if (draft.testAndTagDate) form.append("test_and_tag_date", draft.testAndTagDate);
  }

  for (const [slot, field] of PHOTO_FIELDS) {
    if (!advanced && slot !== "photo") continue;
    const photo = draft.photos[slot];
    if (isFreshFile(photo)) {
      const file = await fileFromDataUrl(photo);
      form.append(field, file);
      if (slot === "photo") form.append("asset_pic", file);
    }
  }

  if (mode === "create") {
    for (const document of draft.documents) {
      if (isFreshFile(document)) form.append("files[]", await fileFromDataUrl(document));
    }
  }

  if (!advanced) {
    // No Depreciation step on this plan: nothing sent, so the server keeps
    // whatever the asset already has.
  } else if (draft.depreciation.enabled) {
    const { method } = draft.depreciation;
    form.append("is_depreciation", "1");
    form.append("depreciation_method", DEPRECIATION_METHOD_TO_API[method]);
    // Only what applies to the method, as on the depreciation screen: a full
    // write-off has no life or rate, and only diminishing value takes a rate.
    if (method !== "Full depreciation on purchase") {
      form.append(
        "effective_life_years",
        typedNumberForApi(draft.depreciation.effectiveLife),
      );
    }
    if (method === "Diminishing value") {
      form.append(
        "depreciation_rate",
        typedNumberForApi(draft.depreciation.overrideRate),
      );
    }
    form.append("residual_value", typedNumberForApi(draft.depreciation.residualValue));
    form.append("cost_limit", typedNumberForApi(draft.depreciation.costLimit));
    form.append(
      "depreciation_start_date",
      draft.depreciation.startDate || draft.purchaseDate,
    );
  } else {
    form.append("is_depreciation", "0");
  }

  return form;
}

/** Large enough that "fetch everything, filter client-side" never silently truncates the register. */
const FETCH_ALL_LIMIT_OFF = "off";

/**
 * Every asset on the register — or every one matching `filters`, which the
 * server applies. The list is still fetched whole (`pagination: off`) because
 * search, sort, paging and the summary cards all work from it in the browser;
 * what the server decides is which assets are in it.
 */
export async function fetchAssets(
  registry: AssetRegistrySnapshot,
  filters?: AssetAdvancedFilters,
): Promise<Asset[]> {
  const filterBy = filters ? assetFiltersToApi(filters) : {};
  const response = await api.get<ApiEnvelope<{ asset_details: ApiAsset[] }>>(
    apiRoutes.asset.list,
    {
      params: {
        pagination: FETCH_ALL_LIMIT_OFF,
        // A JSON string, which `GET /assets` parses itself. Nested params would
        // be serialised by axios as `filter_by[x][]`, which is one more thing
        // the two ends have to agree on for no gain.
        ...(Object.keys(filterBy).length > 0
          ? { filter_by: JSON.stringify(filterBy) }
          : {}),
      },
    },
  );
  const rows = response.data?.data?.asset_details ?? [];
  return rows.map((row) => mapApiAssetToAsset(row, registry));
}

/** One asset's full record — brand/type/model/serial and inventory linkage included. */
export async function fetchAssetDetails(
  id: string,
  registry: AssetRegistrySnapshot,
): Promise<Asset> {
  const response = await api.get<ApiEnvelope<ApiAsset>>(
    apiRoutes.asset.info + id,
  );
  if (!response.data?.data) {
    throw new Error(response.data?.message || "Asset not found.");
  }
  return mapApiAssetToAsset(response.data.data, registry);
}

/** What the payload builder needs to know about the plan. */
export type AssetSaveOptions = {
  /** False on a plan without Advanced Assets — see `assetDraftToFormData`. */
  advanced?: boolean;
};

export async function createAssetApi(
  draft: AssetDraft,
  registry: AssetRegistrySnapshot,
  options: AssetSaveOptions = {},
): Promise<void> {
  const form = await assetDraftToFormData(
    draft,
    registry,
    "create",
    true,
    options.advanced !== false,
  );
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.asset.add,
    form,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to create asset.");
  }

}

export async function updateAssetApi(
  id: string,
  draft: AssetDraft,
  registry: AssetRegistrySnapshot,
  /**
   * The asset as it was loaded for this edit. Without it the account is
   * resolved from the category, as on create.
   */
  original?: Pick<Asset, "category" | "accountSubcategoryId"> &
    Partial<Pick<Asset, "photos">>,
  options: AssetSaveOptions = {},
): Promise<void> {
  const advanced = options.advanced !== false;
  const form = await assetDraftToFormData(
    draft,
    registry,
    "update",
    original ? shouldResolveAccountOnUpdate(draft, original) : true,
    advanced,
  );
  form.append("asset_id", id);
  const removed = removedPhotoFields(original?.photos ?? {}, draft.photos, advanced);
  if (removed.length > 0) form.append("remove_photos", removed.join(","));
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.asset.update,
    form,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update asset.");
  }
}

export type BulkDeleteResult = { deletedIds: string[]; skippedIds: string[] };

/** Reconciled or inventory-linked assets are skipped server-side, not deleted. */
export async function deleteAssetsApi(ids: string[]): Promise<BulkDeleteResult> {
  const response = await api.post<
    ApiEnvelope<{
      deleted_asset_ids?: (number | string)[];
      skipped_asset_ids?: (number | string)[];
    }>
  >(apiRoutes.asset.delete, { assets: ids });
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to delete asset(s).");
  }
  const data = response.data.data ?? {};
  return {
    deletedIds: (data.deleted_asset_ids ?? []).map(String),
    skippedIds: (data.skipped_asset_ids ?? []).map(String),
  };
}

export async function attachAssetDocumentApi(
  assetId: string,
  file: AssetFile,
): Promise<void> {
  const form = new FormData();
  form.append("asset_id", assetId);
  form.append("files[]", await fileFromDataUrl(file));
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.asset.uploadAttachment,
    form,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to attach file.");
  }
}

export async function deleteAssetDocumentApi(documentId: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    apiRoutes.asset.deleteAttachment + "/" + documentId,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to remove file.");
  }
}

/** Whether a document is one already on the server (it has a URL, not data). */
export function isSavedAssetFile(file: AssetFile): boolean {
  return !isFreshFile(file);
}

export type AssetDocumentSyncResult = {
  uploaded: number;
  removed: number;
  /** One line per document that couldn't be attached or removed. */
  failures: string[];
};

/**
 * Brings an existing asset's documents in line with the edit form.
 *
 * `/assets/update` doesn't read `files[]`, so on an edit the form's document
 * list is applied here instead: every freshly picked file is attached, and
 * every saved document that was in `before` but is gone from `after` is
 * deleted by its id. Each is tried on its own, so one bad file doesn't stop
 * the rest — what failed comes back rather than throwing, since the asset
 * itself has already been saved by then.
 */
export async function syncAssetDocumentsApi(
  assetId: string,
  before: AssetFile[],
  after: AssetFile[],
): Promise<AssetDocumentSyncResult> {
  const result: AssetDocumentSyncResult = { uploaded: 0, removed: 0, failures: [] };
  const kept = new Set(after.map((file) => file.id).filter(Boolean));

  for (const file of before) {
    if (!file.id || kept.has(file.id)) continue;
    try {
      await deleteAssetDocumentApi(file.id);
      result.removed += 1;
    } catch (error) {
      result.failures.push(
        `${file.name}: ${error instanceof Error ? error.message : "couldn't be removed"}`,
      );
    }
  }

  for (const file of after) {
    if (!isFreshFile(file)) continue;
    try {
      await attachAssetDocumentApi(assetId, file);
      result.uploaded += 1;
    } catch (error) {
      result.failures.push(
        `${file.name}: ${error instanceof Error ? error.message : "couldn't be attached"}`,
      );
    }
  }

  return result;
}

/**
 * The JSON error `/assets/download` sends (e.g. "No attachments found for
 * selected assets") comes back as a `Blob` too, since the request itself
 * asks for one — read it back out rather than losing it to a generic
 * message that hides a real, specific reason.
 */
async function blobErrorMessage(error: unknown): Promise<string | null> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!(data instanceof Blob)) return null;
  try {
    const parsed = JSON.parse(await data.text());
    return typeof parsed?.message === "string" ? parsed.message : null;
  } catch {
    return null;
  }
}

/** A receipts/photos ZIP for the given assets, straight off `/assets/download`. */
export async function downloadAssetsApi(ids: string[]): Promise<Blob> {
  try {
    const response = await api.get(apiRoutes.asset.download, {
      params: { "assets[]": ids },
      responseType: "blob",
    });
    return response.data as Blob;
  } catch (error) {
    throw new Error(
      (await blobErrorMessage(error)) || "Couldn't download those assets.",
    );
  }
}

/* ------------------------------------------------------------------ *
 * OCR capture — /upload/s3 then /assets/extract
 * ------------------------------------------------------------------ */

type ApiExtractedFields = {
  name?: string | null;
  price?: number | string | null;
  date_of_purchase?: string | null;
  supplier?: string | null;
  category?: string | null;
  serial_no?: string | null;
  warranty_expiry?: string | null;
};

/**
 * `POST /upload/s3`'s response — a flat object, not the usual
 * `{success, data}` envelope (confirmed in `src/routes/upload.js`): the
 * uploaded file's URL/key sit straight on the response body.
 */
type ApiUploadResponse = { success: boolean; error?: string; url?: string; key?: string };

/** Reads a real asset off an uploaded receipt/photo via sole-ocr's capture service. */
export async function extractAssetApi(
  file: File,
  today: string,
): Promise<AssetExtraction> {
  const form = new FormData();
  form.append("file", file);
  const uploadResponse = await api.post<ApiUploadResponse>(
    apiRoutes.asset.ocr.upload,
    form,
  );
  if (!uploadResponse.data?.success || !uploadResponse.data.url) {
    throw new Error(uploadResponse.data?.error || "Failed to upload the file.");
  }

  const response = await api.post<{
    success: boolean;
    error?: string;
    extractedData?: ApiExtractedFields;
    processingInfo?: { confidence?: number };
  }>(apiRoutes.asset.ocr.extract, {
    s3Url: uploadResponse.data.url,
    s3Key: uploadResponse.data.key,
    fileType: file.type,
  });
  if (!response.data?.success || !response.data.extractedData) {
    throw new Error(response.data?.error || "Couldn't read that document.");
  }

  const fields = response.data.extractedData;
  const priceValue = Number(fields.price);
  return {
    // The API reports confidence 0-100; this app's pill logic wants 0-1.
    confidence: (response.data.processingInfo?.confidence ?? 0) / 100,
    fields: {
      name: fields.name ?? "",
      category: categoryFromApi(fields.category ?? null),
      supplierName: fields.supplier ?? "",
      costPrice: Number.isFinite(priceValue) && priceValue > 0 ? String(priceValue) : "",
      // Only a real YYYY-MM-DD reaches the draft — the reader can return
      // "15/03/2026" or "2026-02-30", which the date pickers can't hold.
      purchaseDate: isValidIsoDate(fields.date_of_purchase) ? fields.date_of_purchase : today,
      serialNo: fields.serial_no ?? "",
      warrantyExpiry: isValidIsoDate(fields.warranty_expiry) ? fields.warranty_expiry : "",
      gst: true,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Depreciation — the standalone screen's dedicated /assets/depreciation
 * endpoints. Creating/editing an asset itself still submits depreciation
 * inline through `assetDraftToFormData`, matching sole-webapp; these are
 * for revisiting the settings afterwards without resending the whole asset.
 * ------------------------------------------------------------------ */

type ApiDepreciation = {
  id?: number | string;
  depreciation_method?: string | null;
  effective_life_years?: number | string | null;
  depreciation_rate?: number | string | null;
  residual_value?: number | string | null;
  cost_limit?: number | string | null;
  start_date?: string | null;
};

/**
 * `AssetDepreciation` plus the backend record's own id — needed only here,
 * to delete or re-address the record, not by the pure depreciation math
 * (`depreciationPreview`/`depreciationSchedule`), which never needed an
 * identity for a value that used to live embedded on the asset alone.
 */
export type AssetDepreciationRecord = AssetDepreciation & { id: string };

function mapApiDepreciation(raw: ApiDepreciation): AssetDepreciationRecord {
  return {
    id: String(raw.id ?? ""),
    enabled: true,
    method: depreciationMethodFromApi(raw.depreciation_method ?? null),
    effectiveLife: raw.effective_life_years != null ? String(raw.effective_life_years) : "",
    overrideRate: raw.depreciation_rate != null ? String(raw.depreciation_rate) : "",
    residualValue: raw.residual_value != null ? String(raw.residual_value) : "",
    costLimit: raw.cost_limit != null ? String(raw.cost_limit) : "",
    startDate: raw.start_date ?? "",
  };
}

/** `null` when nothing's been set up yet — not an error, just an unstarted state. */
export async function fetchAssetDepreciation(
  assetId: string,
): Promise<AssetDepreciationRecord | null> {
  try {
    const response = await api.get<ApiEnvelope<ApiDepreciation>>(
      apiRoutes.asset.depreciation.byAsset + assetId,
    );
    return response.data?.data ? mapApiDepreciation(response.data.data) : null;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404) return null;
    throw error;
  }
}

/** Create-or-update: the endpoint upserts on `asset_id` on its own. */
export async function saveAssetDepreciationApi(
  assetId: string,
  values: AssetDepreciation,
): Promise<AssetDepreciationRecord> {
  const response = await api.post<ApiEnvelope<ApiDepreciation>>(
    apiRoutes.asset.depreciation.create,
    {
      asset_id: assetId,
      depreciation_method: DEPRECIATION_METHOD_TO_API[values.method],
      // Only what applies to the method, as the screen's disabled fields say.
      effective_life_years:
        values.method === "Full depreciation on purchase"
          ? null
          : typedNumberForApi(values.effectiveLife) || null,
      depreciation_rate:
        values.method === "Diminishing value"
          ? typedNumberForApi(values.overrideRate) || null
          : null,
      residual_value: typedNumberForApi(values.residualValue) || null,
      cost_limit: typedNumberForApi(values.costLimit) || null,
      start_date: values.startDate,
    },
  );
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to save depreciation.");
  }
  return mapApiDepreciation(response.data.data);
}

/**
 * `DELETE /assets/depreciation/:id` — where `:id` is the **asset** id: the
 * backend looks up the asset's active depreciation record itself
 * (`assetDepreciation` service's `deleteDepreciation(…, asset_id)`).
 */
export async function deleteAssetDepreciationApi(assetId: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    apiRoutes.asset.depreciation.delete + assetId,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to remove depreciation.");
  }
}

/* ------------------------------------------------------------------ *
 * Insurance — /asset-insurance, one record at a time (no "replace the
 * whole list" endpoint exists, so the insurance screen diffs instead).
 * ------------------------------------------------------------------ */

type ApiInsurance = {
  id: number | string;
  insurer_name?: string | null;
  policy_number?: string | null;
  insurer_email?: string | null;
  broker_name?: string | null;
  broker_phone?: string | null;
  coverage_amount?: number | string | null;
  premium_amount?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
};

function mapApiInsurance(raw: ApiInsurance): AssetInsurance {
  return {
    id: String(raw.id),
    insurerName: raw.insurer_name ?? "",
    policyNumber: raw.policy_number ?? "",
    insurerEmail: raw.insurer_email ?? "",
    brokerName: raw.broker_name ?? "",
    brokerPhone: raw.broker_phone ?? "",
    coverageAmount: raw.coverage_amount != null ? String(raw.coverage_amount) : "",
    premiumAmount: raw.premium_amount != null ? String(raw.premium_amount) : "",
    startDate: raw.start_date ?? "",
    endDate: raw.end_date ?? "",
    notes: raw.notes ?? "",
  };
}

function insurancePayload(record: AssetInsurance) {
  return {
    insurer_name: record.insurerName,
    policy_number: record.policyNumber,
    insurer_email: record.insurerEmail,
    broker_name: record.brokerName,
    broker_phone: record.brokerPhone,
    coverage_amount: typedNumberForApi(record.coverageAmount) || 0,
    premium_amount: typedNumberForApi(record.premiumAmount) || null,
    start_date: record.startDate,
    end_date: record.endDate,
    notes: record.notes,
  };
}

export async function fetchAssetInsurance(assetId: string): Promise<AssetInsurance[]> {
  const response = await api.get<ApiEnvelope<ApiInsurance[]>>(
    apiRoutes.asset.insurance.byAsset + assetId,
  );
  return (response.data?.data ?? []).map(mapApiInsurance);
}

export async function createAssetInsuranceApi(
  assetId: string,
  record: AssetInsurance,
): Promise<AssetInsurance> {
  const response = await api.post<ApiEnvelope<ApiInsurance>>(
    apiRoutes.asset.insurance.create,
    { asset_id: assetId, ...insurancePayload(record) },
  );
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to add insurance.");
  }
  return mapApiInsurance(response.data.data);
}

export async function updateAssetInsuranceApi(
  record: AssetInsurance,
): Promise<AssetInsurance> {
  const response = await api.patch<ApiEnvelope<ApiInsurance>>(
    apiRoutes.asset.insurance.update + record.id,
    insurancePayload(record),
  );
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to update insurance.");
  }
  return mapApiInsurance(response.data.data);
}

export async function deleteAssetInsuranceApi(recordId: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    apiRoutes.asset.insurance.delete + recordId,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to remove insurance.");
  }
}

export async function sendAssetInsuranceReportApi(recordId: string): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.asset.insurance.send + recordId + "/send",
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to send the report.");
  }
}

/* ------------------------------------------------------------------ *
 * Disposal — /assets/disposal
 * ------------------------------------------------------------------ */

/**
 * What `GET /assets/disposal/:id` knows about an asset. `disposedDate` is
 * empty while the asset is still held (see `hasDisposal`) — the record still
 * comes back then, because the suggested sale value from its insurance cover
 * is what the disposal form starts from.
 */
export type AssetDisposalRecord = {
  disposedDate: string;
  saleValue: string;
  /** The latest policy's coverage amount, or empty. */
  suggestedSaleValue: string;
  /** That policy's end date, or empty. */
  insuranceEndDate: string;
};

/** Whether a disposal has actually been recorded — the date is the disposal. */
export function hasDisposal(
  record: Pick<AssetDisposalRecord, "disposedDate"> | null | undefined,
): boolean {
  return !!record?.disposedDate;
}

/**
 * What the insurer says the asset is worth, if anyone has said — the disposal
 * form's starting sale value.
 *
 * The server's own suggestion first (the latest policy's coverage, which
 * `GET /assets/disposal/:id` returns whether or not a disposal exists).
 * Failing that, the first policy on file: a second policy on the same asset
 * covers something narrower — tools in transit, say — so the first is the one
 * that stands for the whole thing. A suggestion either way; the field stays
 * editable.
 */
export function suggestedDisposalSaleValue(
  disposal: Pick<AssetDisposalRecord, "suggestedSaleValue"> | null | undefined,
  insurance: Pick<AssetInsurance, "coverageAmount">[],
): string {
  return disposal?.suggestedSaleValue || insurance[0]?.coverageAmount || "";
}

/** `null` only when the server has nothing at all for the asset (a 404). */
export async function fetchAssetDisposal(
  assetId: string,
): Promise<AssetDisposalRecord | null> {
  try {
    const response = await api.get<
      ApiEnvelope<{
        disposed_date?: string | null;
        sale_value?: number | string | null;
        suggested_sale_value?: number | string | null;
        insurance_end_date?: string | null;
      }>
    >(apiRoutes.asset.disposal.byAsset + assetId);
    const data = response.data?.data;
    if (!data) return null;
    return {
      disposedDate: data.disposed_date ?? "",
      saleValue: data.sale_value != null ? String(data.sale_value) : "",
      suggestedSaleValue:
        data.suggested_sale_value != null ? String(data.suggested_sale_value) : "",
      insuranceEndDate: data.insurance_end_date ?? "",
    };
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404) return null;
    throw error;
  }
}

export async function recordAssetDisposalApi(
  assetId: string,
  values: { disposedDate: string; saleValue: string },
): Promise<void> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.asset.disposal.create,
    {
      asset_id: assetId,
      disposed_date: values.disposedDate,
      sale_value: typedNumberForApi(values.saleValue) || null,
    },
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to record disposal.");
  }
}

export async function deleteAssetDisposalApi(assetId: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    apiRoutes.asset.disposal.delete + assetId,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to remove the disposal record.");
  }
}

/* ------------------------------------------------------------------ *
 * Status — /assets/status. Lost/damaged or stolen, and the way back:
 * marking the asset returned. Shares its backend row with Disposal
 * (`AssetStatus`) but is a distinct concern here — a disposed asset is gone
 * for good; a lost or stolen one might still come back.
 * ------------------------------------------------------------------ */

export const ASSET_STATUS_REASONS = ["Lost or damaged", "Stolen"] as const;
export type AssetStatusReason = (typeof ASSET_STATUS_REASONS)[number];

const STATUS_REASON_TO_API: Record<AssetStatusReason, "lost_damaged" | "stolen"> = {
  "Lost or damaged": "lost_damaged",
  Stolen: "stolen",
};

const STATUS_REASON_FROM_API: Record<string, AssetStatusReason> = {
  lost_damaged: "Lost or damaged",
  stolen: "Stolen",
};

export type AssetStatusRecord = {
  reason: AssetStatusReason;
  referenceNo: string;
  policeReportNo: string;
  notes: string;
  isReturned: boolean;
  /** ISO `YYYY-MM-DD` the report was filed, for display only. */
  reportedDate: string;
};

type ApiAssetStatusRecord = {
  status_type?: string | null;
  reference_no?: string | null;
  police_report_no?: string | null;
  notes?: string | null;
  is_returned?: number | boolean | null;
  created_at?: string | null;
};

function mapApiAssetStatus(raw: ApiAssetStatusRecord): AssetStatusRecord {
  return {
    reason: STATUS_REASON_FROM_API[raw.status_type ?? ""] ?? "Lost or damaged",
    referenceNo: raw.reference_no ?? "",
    policeReportNo: raw.police_report_no ?? "",
    notes: raw.notes ?? "",
    isReturned: Boolean(Number(raw.is_returned)),
    reportedDate: raw.created_at ? raw.created_at.slice(0, 10) : "",
  };
}

/** `null` when nothing's been reported — a normal state, not an error. */
export async function fetchAssetStatus(
  assetId: string,
): Promise<AssetStatusRecord | null> {
  try {
    const response = await api.get<ApiEnvelope<ApiAssetStatusRecord>>(
      apiRoutes.asset.status.byAsset + assetId,
    );
    return response.data?.data ? mapApiAssetStatus(response.data.data) : null;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404) return null;
    throw error;
  }
}

export type ReportAssetStatusValues = {
  reason: AssetStatusReason;
  referenceNo: string;
  policeReportNo: string;
  notes: string;
  sendInsuranceReport: boolean;
};

/**
 * Reporting a `Stolen` asset without an insurance record on file is rejected
 * by the backend (422) — the status screen checks `useAssetInsuranceQuery`
 * before ever offering the option, but the server's own message still comes
 * through here rather than being papered over with a generic one.
 */
export async function reportAssetStatusApi(
  assetId: string,
  values: ReportAssetStatusValues,
): Promise<AssetStatusRecord> {
  const response = await api.post<ApiEnvelope<ApiAssetStatusRecord>>(
    apiRoutes.asset.status.create,
    {
      asset_id: assetId,
      status_type: STATUS_REASON_TO_API[values.reason],
      reference_no: values.referenceNo || null,
      police_report_no: values.policeReportNo || null,
      notes: values.notes || null,
      send_insurance_report: values.sendInsuranceReport ? 1 : 0,
    },
  );
  if (!response.data?.success || !response.data.data) {
    throw new Error(response.data?.message || "Failed to report this asset.");
  }
  return mapApiAssetStatus(response.data.data);
}

/** The way back — the asset showed up, or was recovered. */
export async function markAssetReturnedApi(assetId: string): Promise<void> {
  const response = await api.patch<ApiEnvelope<unknown>>(
    apiRoutes.asset.status.markReturned(assetId),
  );
  if (!response.data?.success) {
    throw new Error(
      response.data?.message || "Failed to mark this asset returned.",
    );
  }
}

/** Clears the report entirely — distinct from marking it returned. */
export async function deleteAssetStatusApi(assetId: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    apiRoutes.asset.status.delete + assetId,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to remove this report.");
  }
}

/* ------------------------------------------------------------------ *
 * Registry — /asset-registry/brands and /asset-registry/types.
 * List and create only: the backend has no rename or delete for either.
 * ------------------------------------------------------------------ */

type ApiRegistryRow = { id: number | string; name: string };

export async function fetchAssetRegistry(): Promise<AssetRegistrySnapshot> {
  const [brandsResponse, typesResponse] = await Promise.all([
    api.get<ApiEnvelope<ApiRegistryRow[]>>(apiRoutes.assetRegistry.brands),
    api.get<ApiEnvelope<ApiRegistryRow[]>>(apiRoutes.assetRegistry.types),
  ]);
  const toEntries = (rows: ApiRegistryRow[] | undefined): AssetRegistryEntry[] =>
    (rows ?? []).map((row) => ({ id: Number(row.id), name: row.name }));
  return {
    brands: toEntries(brandsResponse.data?.data),
    types: toEntries(typesResponse.data?.data),
  };
}

export async function createAssetBrandApi(name: string): Promise<AssetRegistryEntry> {
  const response = await api.post<ApiEnvelope<ApiRegistryRow>>(
    apiRoutes.assetRegistry.brands,
    { name: name.trim() },
  );
  if (!response.data?.data) {
    throw new Error(response.data?.message || "Failed to add brand.");
  }
  return { id: Number(response.data.data.id), name: response.data.data.name };
}

export async function createAssetTypeApi(name: string): Promise<AssetRegistryEntry> {
  const response = await api.post<ApiEnvelope<ApiRegistryRow>>(
    apiRoutes.assetRegistry.types,
    { name: name.trim() },
  );
  if (!response.data?.data) {
    throw new Error(response.data?.message || "Failed to add asset type.");
  }
  return { id: Number(response.data.data.id), name: response.data.data.name };
}
