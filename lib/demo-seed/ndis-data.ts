/**
 * NDIS reference data for the demo (Australia only).
 *
 * IMPORTANT: this is DEMO SAMPLE DATA, not the official NDIS Pricing Arrangements and Price
 * Limits. The item numbers, names and the three price tiers are shaped like the real support
 * catalogue (national / remote / very remote, labelled "2026-27") so the invoice and quote
 * editors behave the way they do against the live API, but nobody should read a price here
 * as the current price limit. Registration group and support category names are shortened
 * for display.
 */

export const NDIS_PRICE_SCHEDULE = "2026-27";
export const NDIS_PRICE_EFFECTIVE_FROM = "2026-07-01";

/* ------------------------------------------------------------------ *
 * Support catalogue
 * ------------------------------------------------------------------ */

export type NdisPricingType = "Price Limited Supports" | "Unit Price = $1" | "Quotable Supports" | "";
/** The pricing schedule's Unit column. */
export type NdisUnit = "Hour" | "Each" | "Day" | "Week" | "Month" | "Year";

export interface NdisSupportItem {
  /** Stable catalogue row id (1-based, in catalogue order). */
  id: number;
  number: string;
  name: string;
  registrationGroupNumber: number;
  registrationGroupName: string;
  supportCategoryNumber: number;
  supportCategoryName: string;
  type: NdisPricingType;
  unit: NdisUnit;
  /** The last part of the support's name: "Weekday Daytime", "Cancellation", "Direct Service"... */
  claimType: string | null;
  /** The three published prices; null where the schedule gives none (quotable supports). */
  priceNational: number | null;
  priceRemote: number | null;
  priceVeryRemote: number | null;
  tooltip: string;
  isLegacy: boolean;
  /** A legacy item can be claimed until this date (YYYY-MM-DD). */
  endDate: string | null;
}

/** The pricing schedule's Unit -> the `qty_type` an invoice or quote line stores. */
export const UNIT_TO_QTY_TYPE: Record<NdisUnit, string> = {
  Hour: "hours",
  Each: "items",
  Day: "days",
  Week: "weeks",
  Month: "months",
  Year: "years",
};

type Group = readonly [number, string];

const G = {
  personalCare: [107, "Daily Personal Activities"],
  highIntensity: [104, "High Intensity Daily Personal Activities"],
  household: [120, "Household Tasks"],
  sil: [115, "Assistance With Daily Life Tasks In A Group Or Shared Living Arrangement"],
  nursing: [114, "Community Nursing Care"],
  behaviour: [110, "Specialist Behavioural Intervention Support"],
  lifeSkills: [117, "Development Of Daily Living And Life Skills"],
  transport: [108, "Transport"],
  consumables: [103, "Assistive Products For Personal Care And Safety"],
  mobility: [105, "Assistive Products For Mobility"],
  community: [125, "Participation In Community, Social And Civic Activities"],
  groupActivities: [136, "Group And Centre Based Activities"],
  employment: [133, "Supports In Employment"],
  supportCoordination: [106, "Support Coordination"],
  specialistSc: [132, "Specialist Support Coordination"],
  planManagement: [127, "Management Of Funding For Supports In Participants Plans"],
  therapy: [128, "Therapeutic Supports"],
  exercise: [126, "Exercise Physiology And Personal Well-Being Activities"],
} as const satisfies Record<string, Group>;

const C = {
  daily: [1, "Assistance with Daily Life (Includes SIL)"],
  transport: [2, "Transport"],
  consumables: [3, "Consumables"],
  social: [4, "Assistance with Social, Economic and Community Participation"],
  at: [5, "Assistive Technology"],
  coordination: [7, "Support Coordination"],
  living: [8, "Improved Living Arrangements"],
  participation: [9, "Increased Social and Community Participation"],
  job: [10, "Finding and Keeping a Job"],
  relationships: [11, "Improved Relationships"],
  health: [12, "Improved Health and Wellbeing"],
  choices: [14, "Improved Life Choices"],
  skills: [15, "Improved Daily Living Skills"],
} as const satisfies Record<string, Group>;

type Tiers = readonly [number | null, number | null, number | null];
type Band = "wd" | "we" | "wn" | "sat" | "sun" | "ph";

const BAND_LABEL: Record<Band, string> = {
  wd: "Weekday Daytime",
  we: "Weekday Evening",
  wn: "Weekday Night",
  sat: "Saturday",
  sun: "Sunday",
  ph: "Public Holiday",
};

/** Hourly tiers by time band, for standard and high-intensity supports. */
const STANDARD: Record<Band, Tiers> = {
  wd: [73.58, 103.01, 110.37],
  we: [81.07, 113.5, 121.61],
  wn: [82.57, 115.6, 123.86],
  sat: [103.54, 144.96, 155.31],
  sun: [133.5, 186.9, 200.25],
  ph: [163.46, 228.84, 245.19],
};
const HIGH: Record<Band, Tiers> = {
  wd: [79.6, 111.44, 119.4],
  we: [87.7, 122.78, 131.55],
  wn: [89.32, 125.05, 133.98],
  sat: [112.01, 156.81, 168.02],
  sun: [144.42, 202.19, 216.63],
  ph: [176.84, 247.58, 265.26],
};

type Draft = Omit<NdisSupportItem, "id">;

const row = (
  number: string,
  name: string,
  group: Group,
  category: Group,
  type: NdisPricingType,
  unit: NdisUnit,
  claimType: string | null,
  tiers: Tiers,
  extra: Partial<Pick<NdisSupportItem, "tooltip" | "isLegacy" | "endDate">> = {},
): Draft => ({
  number,
  name,
  registrationGroupNumber: group[0],
  registrationGroupName: group[1],
  supportCategoryNumber: category[0],
  supportCategoryName: category[1],
  type,
  unit,
  claimType,
  priceNational: tiers[0],
  priceRemote: tiers[1],
  priceVeryRemote: tiers[2],
  tooltip: extra.tooltip ?? "",
  isLegacy: extra.isLegacy ?? false,
  endDate: extra.endDate ?? null,
});

const hourly = (number: string, name: string, group: Group, category: Group, claim: string, tiers: Tiers, extra = {}) =>
  row(number, name, group, category, "Price Limited Supports", "Hour", claim, tiers, extra);

/** One support delivered across time bands, e.g. self-care weekday daytime ... public holiday. */
const banded = (
  title: string,
  group: Group,
  category: Group,
  tiersByBand: Record<Band, Tiers>,
  numbers: Partial<Record<Band, string>>,
): Draft[] =>
  (Object.keys(numbers) as Band[]).map((band) =>
    hourly(numbers[band] as string, `${title} - ${BAND_LABEL[band]}`, group, category, BAND_LABEL[band], tiersByBand[band]),
  );

const PSYCH_NOTE = "This includes paid provisionally registered Psychologists operating under supervision.";
const COUNSELLOR_NOTE = "Paid unsupervised provisionally registered psychologists can claim using this line item.";

const THERAPY_TIERS = {
  ot: [193.99, 271.59, 290.99],
  physio: [183.99, 257.59, 275.99],
  psych: [252.99, 354.19, 379.49],
  speech: [193.99, 271.59, 290.99],
} as const satisfies Record<string, Tiers>;

/** The claim-type variants a therapy line carries in the schedule (cancellation, travel...). */
const therapyVariants = (number: string, title: string, tiers: Tiers, extra = {}): Draft[] => {
  const half = tiers.map((price) => (price === null ? null : Math.round((price / 2) * 100) / 100)) as unknown as Tiers;
  return [
    hourly(`${number}_CA`, `${title} - Cancellation`, G.therapy, C.skills, "Cancellation", tiers, extra),
    hourly(`${number}_NF`, `${title} - Non-Face-to-Face`, G.therapy, C.skills, "Non-Face-to-Face", tiers, extra),
    hourly(`${number}_PT`, `${title} - Provider Travel`, G.therapy, C.skills, "Provider Travel", half, extra),
    hourly(`${number}_RR`, `${title} - NDIA Requested Reports`, G.therapy, C.skills, "NDIA Requested Reports", tiers, extra),
    hourly(`${number}_TH`, `${title} - Telehealth`, G.therapy, C.skills, "Telehealth", tiers, extra),
  ];
};

const DRAFTS: Draft[] = [
  /* ---- 01 Assistance with daily life ---- */
  ...banded("Assistance With Self-Care Activities - Standard", G.personalCare, C.daily, STANDARD, {
    wd: "01_011_0107_1_1",
    we: "01_015_0107_1_1",
    wn: "01_002_0107_1_1",
    sat: "01_013_0107_1_1",
    sun: "01_014_0107_1_1",
    ph: "01_012_0107_1_1",
  }),
  row(
    "01_010_0107_1_1",
    "Assistance With Self-Care Activities - Night-Time Sleepover",
    G.personalCare,
    C.daily,
    "Price Limited Supports",
    "Each",
    "Night-Time Sleepover",
    [311.79, 436.51, 467.69],
  ),
  ...banded("Assistance With Self-Care Activities - High Intensity", G.highIntensity, C.daily, HIGH, {
    wd: "01_400_0104_1_1",
    we: "01_401_0104_1_1",
    sat: "01_402_0104_1_1",
    sun: "01_403_0104_1_1",
    ph: "01_404_0104_1_1",
  }),
  hourly("01_450_0107_1_1", "Intensive and Complex Behaviour Supports - Weekday Daytime", G.personalCare, C.daily, "Weekday Daytime", HIGH.wd),
  hourly("01_019_0120_1_1", "House or Yard Maintenance", G.household, C.daily, "", [59.01, 82.61, 88.52]),
  hourly("01_020_0120_1_1", "House Cleaning And Other Household Activities", G.household, C.daily, "", [60.1, 84.14, 90.15]),
  row(
    "01_022_0120_1_1",
    "Assistance With The Cost Of Preparation And Delivery Of Meals",
    G.household,
    C.daily,
    "Quotable Supports",
    "Each",
    null,
    [null, null, null],
    { isLegacy: true, endDate: "2027-09-30" },
  ),
  hourly("01_134_0117_8_1", "Capacity Building and Training in Self-Management and Plan Management", G.lifeSkills, C.daily, "", [83.87, 117.42, 125.81]),
  ...banded("Assistance in Supported Independent Living - Standard", G.sil, C.daily, STANDARD, {
    wd: "01_801_0115_1_1",
    we: "01_802_0115_1_1",
    sat: "01_804_0115_1_1",
  }),
  row(
    "01_832_0115_1_1",
    "Assistance in Supported Independent Living - Night-Time Sleepover",
    G.sil,
    C.daily,
    "Price Limited Supports",
    "Each",
    "Night-Time Sleepover",
    [311.79, 436.51, 467.69],
  ),
  hourly("01_600_0114_1_1", "Delivery of Health Supports by an Enrolled Nurse - Weekday Daytime", G.nursing, C.daily, "Weekday Daytime", [103.44, 144.82, 155.16]),
  hourly("01_606_0114_1_1", "Delivery of Health Supports by a Registered Nurse - Weekday Daytime", G.nursing, C.daily, "Weekday Daytime", [128.05, 179.27, 192.08]),
  row("01_799_0107_1_1", "Provider travel - non-labour costs", G.personalCare, C.daily, "Unit Price = $1", "Each", "non-labour costs", [1, null, null]),

  /* ---- 02 Transport ---- */
  row("02_051_0108_1_1", "Transport", G.transport, C.transport, "Unit Price = $1", "Year", null, [1, 1, 1]),

  /* ---- 03 Consumables ---- */
  row("03_040000919_0103_1_1", "Disability-Related Health Consumables - Low Cost", G.consumables, C.consumables, "Unit Price = $1", "Each", "Low Cost", [1, null, null]),
  row("03_092100082_0103_1_1", "Continence - consumables", G.consumables, C.consumables, "Unit Price = $1", "Each", "consumables", [1, null, null]),
  row("03_093021079_0103_1_1", "Continence - disposable personal protection", G.consumables, C.consumables, "Unit Price = $1", "Each", "disposable personal protection", [1, null, null]),
  row("03_120000911_0105_1_1", "Low Cost AT - Personal Mobility", G.mobility, C.consumables, "Unit Price = $1", "Each", "Personal Mobility", [1, null, null]),

  /* ---- 04 Social and community participation ---- */
  ...banded("Access Community Social and Rec Activ - Standard", G.community, C.social, STANDARD, {
    wd: "04_104_0125_6_1",
    we: "04_103_0125_6_1",
    sat: "04_105_0125_6_1",
    sun: "04_106_0125_6_1",
    ph: "04_102_0125_6_1",
  }),
  hourly("04_400_0104_1_1", "Access Community Social and Rec Activ - High Intensity - Weekday Daytime", G.highIntensity, C.social, "Weekday Daytime", HIGH.wd),
  ...banded("Group Activities - Standard", G.groupActivities, C.social, STANDARD, {
    wd: "04_102_0136_6_1",
    we: "04_103_0136_6_1",
    sat: "04_104_0136_6_1",
    sun: "04_105_0136_6_1",
  }),
  row("04_799_0125_6_1", "Provider travel - non-labour costs", G.community, C.social, "Unit Price = $1", "Each", "non-labour costs", [1, null, null]),

  /* ---- 05 Assistive technology ---- */
  row("05_122203811_0105_1_2", "Wheelchair - Manual - Folding - Basic", G.mobility, C.at, "", "Each", "Basic", [null, null, null]),
  row("05_0002_0105_1_2", "AT Supplementary Charge - Personal Mobility or Transfer", G.mobility, C.at, "Unit Price = $1", "Each", "Personal Mobility or Transfer", [1, null, null]),

  /* ---- 07 Support coordination ---- */
  hourly("07_001_0106_8_3", "Support Coordination Level 1: Support Connection", G.supportCoordination, C.coordination, "", [80.06, 112.08, 120.09]),
  hourly("07_002_0106_8_3", "Support Coordination Level 2: Coordination of Supports", G.supportCoordination, C.coordination, "", [100.14, 140.19, 150.21]),
  hourly("07_004_0132_8_3", "Support Coordination Level 3: Specialist Support Coordination", G.specialistSc, C.coordination, "", [190.54, 266.75, 285.8]),
  hourly("07_101_0106_6_3", "Psychosocial Recovery Coaching - Weekday Daytime", G.supportCoordination, C.coordination, "Weekday Daytime", [110.44, 154.62, 165.66]),
  row("07_799_0106_6_3", "Provider travel - non-labour costs", G.supportCoordination, C.coordination, "Unit Price = $1", "Each", "non-labour costs", [1, null, null]),

  /* ---- 08 / 09 / 10 / 11 capacity building ---- */
  row("08_799_0106_2_3", "Provider travel - non-labour costs", G.supportCoordination, C.living, "Unit Price = $1", "Each", "non-labour costs", [1, null, null]),
  hourly("09_006_0106_6_3", "Life Transition Planning Incl. Mentoring Peer-Support And Indiv Skill Develop", G.supportCoordination, C.participation, "", [83.87, 117.42, 125.81]),
  hourly("10_806_0133_5_1", "Supports in Employment - Weekday Daytime", G.employment, C.job, "Weekday Daytime", STANDARD.wd),
  hourly("11_022_0110_7_3", "Specialist Behavioural Intervention Support - Direct Service", G.behaviour, C.relationships, "Direct Service", THERAPY_TIERS.psych),
  hourly("11_023_0110_7_3", "Behaviour Management Plan Implementation - Direct Service", G.behaviour, C.relationships, "Direct Service", THERAPY_TIERS.psych),
  hourly("12_025_0128_3_3", "Therapy - Dietitian - Direct Service", G.therapy, C.health, "Direct Service", [178.99, 250.59, 268.49]),
  hourly("12_027_0128_3_3", "Therapy - Exercise Physiologist - Direct Service", G.exercise, C.health, "Direct Service", [161.99, 226.79, 242.99]),

  /* ---- 14 Plan management ---- */
  row("14_034_0127_8_3", "Plan Management - Monthly Fee", G.planManagement, C.choices, "Price Limited Supports", "Month", "Monthly Fee", [104.45, 104.45, 104.45]),
  // Superseded and past its end date: never offered by search or the catalogue.
  hourly("14_031_0127_8_3", "CB and Training in Plan and Financial Management by a Plan Manager", G.planManagement, C.choices, "", [65.09, 91.13, 97.64], {
    isLegacy: true,
    endDate: "2026-09-30",
  }),

  /* ---- 15 Improved daily living skills: therapy ---- */
  hourly("15_054_0128_1_3", "Therapy - Psychologist - Direct Service", G.therapy, C.skills, "Direct Service", THERAPY_TIERS.psych, { tooltip: PSYCH_NOTE }),
  hourly("15_055_0128_1_3", "Therapy - Physiotherapist - Direct Service", G.therapy, C.skills, "Direct Service", THERAPY_TIERS.physio),
  hourly("15_617_0128_1_3", "Therapy - Occupational Therapist - Direct Service", G.therapy, C.skills, "Direct Service", THERAPY_TIERS.ot),
  hourly("15_622_0128_1_3", "Therapy - Speech Pathologist - Direct Service", G.therapy, C.skills, "Direct Service", THERAPY_TIERS.speech),
  hourly("15_043_0128_1_3", "Therapy - Counsellor - Direct Service", G.therapy, C.skills, "Direct Service", [156.16, 218.62, 234.24], { tooltip: COUNSELLOR_NOTE }),
  hourly("15_056_0128_1_3", "Therapy - Other Professional - Direct Service", G.therapy, C.skills, "Direct Service", [156.16, 218.62, 234.24]),
  hourly("15_052_0128_1_3", "Therapy Assistant - Level 1 - Direct Service", G.therapy, C.skills, "Direct Service", [56.16, 78.62, 84.24]),
  hourly("15_053_0128_1_3", "Therapy Assistant - Level 2 - Direct Service", G.therapy, C.skills, "Direct Service", [86.79, 121.51, 130.19]),
  ...therapyVariants("15_617_0128_1_3", "Therapy - Occupational Therapist", THERAPY_TIERS.ot),
  ...therapyVariants("15_054_0128_1_3", "Therapy - Psychologist", THERAPY_TIERS.psych, { tooltip: PSYCH_NOTE }),
  hourly("15_055_0128_1_3_CA", "Therapy - Physiotherapist - Cancellation", G.therapy, C.skills, "Cancellation", THERAPY_TIERS.physio),
  hourly("15_622_0128_1_3_CA", "Therapy - Speech Pathologist - Cancellation", G.therapy, C.skills, "Cancellation", THERAPY_TIERS.speech),
];

export const NDIS_SUPPORT_ITEMS: readonly NdisSupportItem[] = DRAFTS.map((draft, index) => ({ ...draft, id: index + 1 }));

const BY_NUMBER = new Map(NDIS_SUPPORT_ITEMS.map((item) => [item.number, item]));
export const ndisItemByNumber = (number: string): NdisSupportItem | undefined => BY_NUMBER.get(number);

/** Today's claimable catalogue: items past their end date are gone. */
export const isClaimableOn = (item: NdisSupportItem, today: string): boolean => item.endDate === null || item.endDate >= today;

/* ------------------------------------------------------------------ *
 * Default invoice and quote templates (the New invoice / New quote gallery)
 * ------------------------------------------------------------------ */

export type NdisClaimTypeLabel =
  | "Standard Service"
  | "Travel – Time"
  | "Travel – Non-Labour Costs"
  | "Cancellation"
  | "Non-Face-to-Face (NF2F)"
  | "Report Writing"
  | "NDIA Requested Reports"
  | "Telehealth";

export interface NdisTemplateLine {
  number: string;
  qty: number;
  claim?: NdisClaimTypeLabel;
  /** Overrides the catalogue's national price (a quotable support has none). */
  price?: number;
}

export interface NdisTemplateSpec {
  /** Stable key, so a list row and its detail always match. */
  key: string;
  name: string;
  description: string;
  popular?: boolean;
  recentlyUsed?: boolean;
  /** Days until due (an invoice) or until the quote expires. */
  paymentTerm: number;
  notes: string;
  lines: NdisTemplateLine[];
}

const INVOICE_NOTES =
  "NDIS supports are GST-free. Please quote the participant's NDIS number on remittance. Payment terms 7 days, or claim through the NDIA portal if agency-managed.";

export const NDIS_INVOICE_TEMPLATES: readonly NdisTemplateSpec[] = [
  {
    key: "weekly-personal-care",
    name: "Weekly personal care",
    description: "Regular self-care support across weekday, evening and Saturday shifts.",
    popular: true,
    paymentTerm: 7,
    notes: INVOICE_NOTES,
    lines: [
      { number: "01_011_0107_1_1", qty: 10 },
      { number: "01_015_0107_1_1", qty: 5 },
      { number: "01_013_0107_1_1", qty: 3 },
    ],
  },
  {
    key: "community-access",
    name: "Community access",
    description: "Weekday and Saturday community participation with provider travel.",
    popular: true,
    recentlyUsed: true,
    paymentTerm: 7,
    notes: INVOICE_NOTES,
    lines: [
      { number: "04_104_0125_6_1", qty: 8 },
      { number: "04_105_0125_6_1", qty: 4 },
      { number: "04_799_0125_6_1", qty: 30, claim: "Travel – Non-Labour Costs" },
    ],
  },
  {
    key: "support-coordination-monthly",
    name: "Support coordination monthly",
    description: "Level 2 coordination of supports for the month, with the progress report.",
    popular: true,
    paymentTerm: 14,
    notes: INVOICE_NOTES,
    lines: [
      { number: "07_002_0106_8_3", qty: 4 },
      { number: "07_002_0106_8_3", qty: 1, claim: "Report Writing" },
      { number: "07_799_0106_6_3", qty: 18, claim: "Travel – Non-Labour Costs" },
    ],
  },
  {
    key: "plan-management-fee",
    name: "Plan management fee",
    description: "The monthly plan management fee.",
    recentlyUsed: true,
    paymentTerm: 14,
    notes: INVOICE_NOTES,
    lines: [{ number: "14_034_0127_8_3", qty: 1 }],
  },
  {
    key: "transport",
    name: "Transport",
    description: "Participant transport: kilometres driven plus the driver's travel time.",
    paymentTerm: 7,
    notes: INVOICE_NOTES,
    lines: [
      { number: "01_799_0107_1_1", qty: 85, claim: "Travel – Non-Labour Costs" },
      { number: "01_011_0107_1_1", qty: 0.75, claim: "Travel – Time" },
    ],
  },
  {
    key: "cancellation-short-notice",
    name: "Cancellation (short notice)",
    description: "Supports cancelled inside the notice period, claimed as a cancellation.",
    paymentTerm: 7,
    notes: `${INVOICE_NOTES} Cancellations are claimable where under 7 days' notice was given.`,
    lines: [
      { number: "01_011_0107_1_1", qty: 2, claim: "Cancellation" },
      { number: "04_104_0125_6_1", qty: 3, claim: "Cancellation" },
    ],
  },
  {
    key: "therapy-assistant",
    name: "Therapy assistant",
    description: "Therapy assistant sessions, level 1 and level 2.",
    paymentTerm: 7,
    notes: INVOICE_NOTES,
    lines: [
      { number: "15_052_0128_1_3", qty: 4 },
      { number: "15_053_0128_1_3", qty: 2 },
    ],
  },
  {
    key: "occupational-therapy",
    name: "Occupational therapy session",
    description: "An OT session with the write-up and the NDIA report.",
    paymentTerm: 14,
    notes: INVOICE_NOTES,
    lines: [
      { number: "15_617_0128_1_3", qty: 1.5 },
      { number: "15_617_0128_1_3_NF", qty: 1, claim: "Non-Face-to-Face (NF2F)" },
      { number: "15_617_0128_1_3_RR", qty: 2, claim: "NDIA Requested Reports" },
    ],
  },
  {
    key: "weekend-public-holiday",
    name: "Weekend and public holiday support",
    description: "Saturday, Sunday and public holiday support hours.",
    paymentTerm: 7,
    notes: INVOICE_NOTES,
    lines: [
      { number: "01_013_0107_1_1", qty: 6 },
      { number: "01_014_0107_1_1", qty: 6 },
      { number: "01_012_0107_1_1", qty: 4 },
    ],
  },
  {
    key: "overnight-sil",
    name: "Overnight and shared living",
    description: "Supported independent living weekday hours plus night-time sleepovers.",
    paymentTerm: 14,
    notes: INVOICE_NOTES,
    lines: [
      { number: "01_801_0115_1_1", qty: 8 },
      { number: "01_832_0115_1_1", qty: 5 },
    ],
  },
];

const QUOTE_NOTES =
  "Prices are based on the NDIS Pricing Arrangements and Price Limits 2026-27 and are GST-free. This quote is valid for 30 days. Supports are delivered under the participant's service agreement.";

export const NDIS_QUOTE_TEMPLATES: readonly NdisTemplateSpec[] = [
  {
    key: "quote-daily-living",
    name: "Daily living support plan",
    description: "Ongoing personal care across the week for the plan period.",
    popular: true,
    paymentTerm: 30,
    notes: QUOTE_NOTES,
    lines: [
      { number: "01_011_0107_1_1", qty: 260 },
      { number: "01_015_0107_1_1", qty: 130 },
      { number: "01_013_0107_1_1", qty: 52 },
    ],
  },
  {
    key: "quote-community-access",
    name: "Community access program",
    description: "Weekly community participation and group activities.",
    popular: true,
    paymentTerm: 30,
    notes: QUOTE_NOTES,
    lines: [
      { number: "04_104_0125_6_1", qty: 200 },
      { number: "04_102_0136_6_1", qty: 80 },
      { number: "04_799_0125_6_1", qty: 1500, claim: "Travel – Non-Labour Costs" },
    ],
  },
  {
    key: "quote-support-coordination",
    name: "Support coordination (12 months)",
    description: "Level 2 support coordination for a full plan year.",
    paymentTerm: 30,
    notes: QUOTE_NOTES,
    lines: [
      { number: "07_002_0106_8_3", qty: 48 },
      { number: "07_002_0106_8_3", qty: 4, claim: "Report Writing" },
    ],
  },
  {
    key: "quote-therapy-block",
    name: "Therapy block",
    description: "An occupational therapy assessment and a block of sessions.",
    paymentTerm: 30,
    notes: QUOTE_NOTES,
    lines: [
      { number: "15_617_0128_1_3", qty: 14 },
      { number: "15_617_0128_1_3_RR", qty: 3, claim: "NDIA Requested Reports" },
      { number: "15_052_0128_1_3", qty: 20 },
    ],
  },
  {
    key: "quote-sil",
    name: "Supported independent living",
    description: "Shared living support with sleepovers for the quarter.",
    paymentTerm: 30,
    notes: QUOTE_NOTES,
    lines: [
      { number: "01_801_0115_1_1", qty: 520 },
      { number: "01_832_0115_1_1", qty: 90 },
    ],
  },
  {
    key: "quote-plan-management",
    name: "Plan management (12 months)",
    description: "Monthly plan management for the plan year.",
    paymentTerm: 30,
    notes: QUOTE_NOTES,
    lines: [{ number: "14_034_0127_8_3", qty: 12 }],
  },
];

export const NDIS_QUOTE_NOTES = QUOTE_NOTES;

/* ------------------------------------------------------------------ *
 * Proposal templates
 * ------------------------------------------------------------------ */

export interface NdisProposalService {
  description: string;
  quantity: number;
  price: number;
}

export interface NdisProposalTemplateSpec {
  key: string;
  type: "PROPOSAL" | "INTRODUCTION" | "TERMS" | "THANK_YOU";
  /** `{business}` is replaced with the business's name. */
  name: string;
  description: string;
  created: string;
  services?: NdisProposalService[];
  /** Paragraphs of the section's body. */
  paragraphs?: string[];
}

export const NDIS_PROPOSAL_TEMPLATES: readonly NdisProposalTemplateSpec[] = [
  {
    key: "service-agreement",
    type: "PROPOSAL",
    name: "NDIS Service Agreement",
    description: "Service agreement for a new participant: supports, rates, cancellation terms and how we invoice.",
    created: "2026-08-01",
    services: [
      { description: "Assistance with self-care activities - weekday daytime", quantity: 10, price: 73.58 },
      { description: "Access community, social and recreational activities - weekday daytime", quantity: 8, price: 73.58 },
      { description: "Provider travel - non-labour costs", quantity: 40, price: 1 },
    ],
  },
  {
    key: "support-plan",
    type: "PROPOSAL",
    name: "Support Plan Proposal",
    description: "A proposed weekly support roster with the goals each support is working towards.",
    created: "2026-09-01",
    services: [
      { description: "Assistance with self-care activities - weekday evening", quantity: 7, price: 81.07 },
      { description: "Assistance with self-care activities - Saturday", quantity: 4, price: 103.54 },
      { description: "Therapy assistant - level 2", quantity: 2, price: 86.79 },
    ],
  },
  {
    key: "support-coordination",
    type: "PROPOSAL",
    name: "Support Coordination Proposal",
    description: "Level 2 support coordination: connecting you to providers and keeping your plan on track.",
    created: "2026-10-01",
    services: [
      { description: "Support coordination level 2: coordination of supports", quantity: 48, price: 100.14 },
      { description: "Support coordination - report writing", quantity: 4, price: 100.14 },
    ],
  },
  {
    key: "welcome",
    type: "INTRODUCTION",
    name: "Welcome to {business}",
    description: "Introductory cover page for {business}: who we are, how we work and what every proposal includes.",
    created: "2026-07-01",
    paragraphs: [
      "Welcome to {business}. We provide person-centred disability supports that put you in charge of your plan, your goals and your day.",
      "Every support we propose follows the NDIS Pricing Arrangements and Price Limits, and nothing is delivered without a signed service agreement.",
      "We'll walk you through the proposal, answer your questions and adjust it until it fits your plan.",
    ],
  },
  {
    key: "terms",
    type: "TERMS",
    name: "NDIS service agreement terms",
    description: "Terms for delivering supports: cancellations, changes, privacy and how to give feedback.",
    created: "2026-07-15",
    paragraphs: [
      "Supports are delivered as set out in the schedule of supports and charged at or below the NDIS price limits.",
      "Short notice cancellations (under 7 days) may be charged as agreed in your service agreement.",
      "You can change or end this agreement at any time with 14 days' written notice. We handle your information in line with the Privacy Act 1988 and the NDIS Code of Conduct.",
    ],
  },
  {
    key: "thank-you",
    type: "THANK_YOU",
    name: "Thank you for choosing {business}",
    description: "Sent once a participant accepts a proposal.",
    created: "2026-07-20",
    paragraphs: ["Thank you for choosing {business}. We'll be in touch within one business day to schedule your first support."],
  },
];
