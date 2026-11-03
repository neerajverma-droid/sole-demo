import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { toNullableNumber, toNumber, unwrap, type Envelope } from "@/lib/investment-property";

export type CgtBreakdown = {
  propertyName: string;
  taxTreatment: string;
  disposalDate: string;
  salePrice: number;
  sellingCosts: number;
  netProceeds: number;
  purchasePrice: number;
  stampDuty: number;
  legalCosts: number;
  buyerAgentCosts: number;
  capitalImprovements: number;
  totalCostBase: number;
  grossGain: number;
  grossLoss: number;
  heldOverTwelveMonths: boolean;
  entityEligible: boolean;
  discountEligible: boolean;
  discountPercentage: number;
  discountAmount: number;
  discountReason: string;
  taxableGain: number | null;
  reviewRequired: boolean;
  warnings: string[];
  disclaimer: string;
  calculationLimited: boolean;
};

type ApiCgt = {
  property_name?: string;
  property_tax_treatment?: string;
  disposal?: {
    disposal_date?: string | null;
    sale_price?: number | string;
    selling_costs?: number | string;
    net_sale_proceeds?: number | string;
  };
  cost_base?: {
    purchase_price?: number | string;
    stamp_duty?: number | string;
    legal_costs?: number | string;
    buyer_agent_costs?: number | string;
    capital_improvements?: number | string;
    total_cost_base?: number | string;
  };
  capital_gain?: { gross_capital_gain?: number | string; gross_capital_loss?: number | string };
  discount?: {
    held_longer_than_12_months?: boolean;
    entity_eligible?: boolean;
    eligible?: boolean;
    discount_percentage?: number | string;
    discount_amount?: number | string;
    reason?: string;
  };
  taxable_gain?: { estimated_taxable_capital_gain?: number | string | null };
  review_flags?: { accountant_review_required?: boolean };
  notifications?: {
    ppor_warning?: string | null;
    absence_rule_warning?: string | null;
    history_gap_warning?: string | null;
  };
  disclaimers?: { message?: string; calculation_limited?: boolean };
};

export function mapCgt(raw: ApiCgt): CgtBreakdown {
  const notes = raw.notifications ?? {};
  return {
    propertyName: raw.property_name ?? "",
    taxTreatment: raw.property_tax_treatment ?? "investment",
    disposalDate: raw.disposal?.disposal_date ?? "",
    salePrice: toNumber(raw.disposal?.sale_price),
    sellingCosts: toNumber(raw.disposal?.selling_costs),
    netProceeds: toNumber(raw.disposal?.net_sale_proceeds),
    purchasePrice: toNumber(raw.cost_base?.purchase_price),
    stampDuty: toNumber(raw.cost_base?.stamp_duty),
    legalCosts: toNumber(raw.cost_base?.legal_costs),
    buyerAgentCosts: toNumber(raw.cost_base?.buyer_agent_costs),
    capitalImprovements: toNumber(raw.cost_base?.capital_improvements),
    totalCostBase: toNumber(raw.cost_base?.total_cost_base),
    grossGain: toNumber(raw.capital_gain?.gross_capital_gain),
    grossLoss: toNumber(raw.capital_gain?.gross_capital_loss),
    heldOverTwelveMonths: Boolean(raw.discount?.held_longer_than_12_months),
    entityEligible: Boolean(raw.discount?.entity_eligible),
    discountEligible: Boolean(raw.discount?.eligible),
    discountPercentage: toNumber(raw.discount?.discount_percentage),
    discountAmount: toNumber(raw.discount?.discount_amount),
    discountReason: raw.discount?.reason ?? "",
    taxableGain: toNullableNumber(raw.taxable_gain?.estimated_taxable_capital_gain),
    reviewRequired: Boolean(raw.review_flags?.accountant_review_required),
    warnings: [notes.ppor_warning, notes.absence_rule_warning, notes.history_gap_warning].filter(
      (message): message is string => Boolean(message),
    ),
    disclaimer: raw.disclaimers?.message ?? "",
    calculationLimited: Boolean(raw.disclaimers?.calculation_limited),
  };
}

export async function fetchCgtBreakdown(propertyId: string): Promise<CgtBreakdown> {
  const response = await api.get<Envelope<ApiCgt>>(
    `${apiRoutes.investment.cgtBreakdown}${encodeURIComponent(propertyId)}`,
  );
  return mapCgt(unwrap(response, "Couldn't load the CGT breakdown."));
}

export type CgtTaxImpact = {
  available: boolean;
  estimatedTax: number | null;
  ratePercentage: number | null;
  message: string;
  disclaimer: string;
};

type ApiImpact = {
  calculation_available?: boolean;
  estimated_tax_impact?: number | string | null;
  tax_rate_percentage?: number | string | null;
  message?: string;
  disclaimer?: string;
};

export async function fetchCgtTaxImpact(propertyId: string): Promise<CgtTaxImpact> {
  const response = await api.get<Envelope<ApiImpact>>(
    `${apiRoutes.investment.cgtTaxImpact}${encodeURIComponent(propertyId)}`,
  );
  const data = unwrap(response, "Couldn't load the tax impact estimate.");
  return {
    available: Boolean(data.calculation_available),
    estimatedTax: toNullableNumber(data.estimated_tax_impact),
    ratePercentage: toNullableNumber(data.tax_rate_percentage),
    message: data.message ?? "",
    disclaimer: data.disclaimer ?? "",
  };
}

export async function fetchAccountantExport(propertyId: string): Promise<unknown> {
  const response = await api.get<Envelope<unknown>>(
    `${apiRoutes.investment.accountantExport}${encodeURIComponent(propertyId)}`,
  );
  return unwrap(response, "Couldn't prepare the accountant export.");
}

export function accountantExportFileName(propertyName: string, date: Date = new Date()): string {
  const slug = propertyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "property"}-cgt-accountant-export-${date.toISOString().slice(0, 10)}.json`;
}
