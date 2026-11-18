/**
 * Offline Mock Server for Sole Demo.
 * Intercepts Axios and Fetch requests in demo mode and returns realistic
 * seeded data from Coastal Spark Electrical without calling backend APIs.
 *
 * All write requests (POST, PUT, PATCH, DELETE) are rejected in read-only demo mode
 * with a visible notification.
 */

import { toast } from "sonner";
import { generateSeedData, type SeedData } from "./generator";
import { decryptPayload } from "@/utils/encrypt";

function extractBodyFields(body: any): Record<string, any> {
  if (!body) return {};
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const fields: Record<string, any> = {};
    body.forEach((value, key) => {
      fields[key] = value;
    });
    return fields;
  }
  if (typeof body === "object" && typeof body.data === "string") {
    try {
      return (decryptPayload(body.data) as Record<string, any>) || {};
    } catch {
      // not encrypted or decrypt failed
    }
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return typeof body === "object" ? body : {};
}

let seedData: SeedData | null = null;

export function getSeedData(): SeedData {
  if (!seedData) {
    seedData = generateSeedData();
  }
  return seedData;
}

export function resetSeedData(): void {
  seedData = generateSeedData();
}

export const demoUser = {
  user_id: 1,
  id: 1,
  email: "accounts.coastalspark@example.com",
  user_email: "accounts.coastalspark@example.com",
  first_name: "Sam",
  last_name: "Taylor",
  full_name: "Sam Taylor",
  business_name: "Coastal Spark Electrical",
  role: "Owner",
  is_demo: false,
  account_verified: 1,
  plan: "pro",
  has_password: true,
  trial_active: false,
  is_first_login: false,
  is_onboarding_skipped: 1,
  is_transaction_present: 1,
  token: "demo_coastalspark_session_token",
  refresh_token: "demo_coastalspark_refresh_token",
  demo_expires_at: new Date(Date.now() + 86400000).toISOString(),
  business_id: 1,
  businesses: [
    {
      id: 1,
      business_name: "Coastal Spark Electrical",
      email: "accounts.coastalspark@example.com",
      abn: "51 824 753 556",
      country_iso2: "AU",
      currency: "AUD",
      currency_symbol: "$",
      timezone: "Australia/Brisbane",
      tax_registered: 1,
      accounting_type: "cash",
    },
  ],
};

export const ALL_DEMO_ALLOWED_FEATURES = [
  "dashboard",
  "sales",
  "expenses",
  "assets",
  "assets-advanced",
  "contacts",
  "resources",
  "referral",
  "community",
  "perks",
  "settings",
  "support",
  "education",
  "reporting",
  "migrations",
  "transactions",
  "projects",
  "time-tracking",
  "booking",
  "km-tracker",
  "investment",
  "inventory",
  "payroll",
  "reputation",
  "liabilities",
  "equity",
  "tax-estimator",
  "proposals",
];

export const demoApiBusiness = {
  id: 1,
  business_name: "Coastal Spark Electrical",
  company_name: "Coastal Spark Electrical",
  first_name: "Sam",
  last_name: "Taylor",
  business_email: "accounts.coastalspark@example.com",
  email: "accounts.coastalspark@example.com",
  abn: "51 824 753 556",
  business_registration_number: "51 824 753 556",
  tax_registration_number: "51 824 753 556",
  is_default: true,
  requires_payment: false,
  is_locked: false,
  payment_status: "paid",
  subscription_status: "active",
  is_payroll_enabled: 1,
  payroll_enabled: 1,
  logo: null,
  subscription: {
    status: "active",
    plan_slug: "pro",
    plan_name: "Sole Pro Plan",
    plan_interval: "monthly",
    monthly_price: 29,
    effective_monthly_price: 29,
    discount_percent: 0,
    is_trial: false,
    trial_end: "",
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
    addons: [
      "project",
      "booking",
      "time",
      "investment",
      "km",
      "assets-advanced",
      "payroll",
      "proposals",
      "reputation",
      "tax-estimator",
    ],
  },
  industry_id: 1,
  industry: "Electrical services",
  timezone: "Australia/Brisbane",
  ndis_no: "",
  accounting_type: "cash",
  company_type: "Sole Trader",
  country_iso2: "AU",
  country_code: "+61",
  mobile_no: "0491 570 006",
  phone: "0491 570 006",
  bank_name: "Coastal Community Bank",
  bsb: "484-799",
  account_holder: "Coastal Spark Electrical",
  account_number: "10492831",
  show_bank_detail_invoice: 1,
  address: "14 Ferry Road, Southport QLD 4215, Australia",
  address_line1: "14 Ferry Road",
  city: "Southport",
  state: "QLD",
  postcode: "4215",
  country: "Australia",
  website: "https://coastalspark.example.com",
  documents: [],
};

export interface MockResponse {
  status: number;
  data: any;
  headers?: Record<string, string>;
  message?: string;
  success?: boolean;
}

function normalizePath(url: string): string {
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.pathname.replace(/^\/api/, "").replace(/\/$/, "");
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api/, "").replace(/\/$/, "");
  }
}

/** Notification throttle so multiple parallel writes don't spam toasts */
let lastToastTime = 0;
function notifyReadOnly() {
  if (typeof window !== "undefined") {
    const now = Date.now();
    if (now - lastToastTime > 2000) {
      lastToastTime = now;
      toast.error("Demo mode is read-only. Changes cannot be saved.", {
        description: "Explore listings, features, and reports freely. Creating or editing data is disabled.",
      });
    }
  }
}

export function handleMockRequest(
  method: string,
  url: string,
  rawParams: Record<string, any> = {},
  _body?: any,
): MockResponse | null {
  const normMethod = method.toUpperCase();
  const path = normalizePath(url);
  const seed = getSeedData();

  // Extract query parameters from URL if any
  const urlParams: Record<string, any> = {};
  try {
    const parsed = new URL(url, "http://localhost");
    parsed.searchParams.forEach((val, key) => {
      urlParams[key] = val;
    });
  } catch {}
  const params: Record<string, any> = { ...urlParams, ...(rawParams || {}) };

  /* ------------------------------------------------------------------ *
   * Auth & Session Lifecycle (Allowed Writes)
   * ------------------------------------------------------------------ */
  if (path === "/demo/login" || (normMethod === "POST" && path === "/auth/login")) {
    return {
      status: 200,
      data: {
        success: true,
        message: "Demo sign in successful",
        data: { user: demoUser },
      },
    };
  }

  if (path === "/demo/heartbeat") {
    return {
      status: 200,
      data: {
        success: true,
        message: "OK",
        data: {
          demo_expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      },
    };
  }

  if (path === "/auth/logout" || path === "/auth/signout") {
    return {
      status: 200,
      data: { success: true, message: "Logged out" },
    };
  }

  if (path === "/v1/device/register") {
    return {
      status: 200,
      data: {
        success: true,
        data: { device_id: 1, id: 1 },
      },
    };
  }

  if (path === "/auth/profile" || path === "/profile") {
    return {
      status: 200,
      data: {
        success: true,
        data: { user: demoUser },
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * READ-OVER-POST Endpoints (POST requests used for reading data)
   * ------------------------------------------------------------------ */
  if (path === "/user/getProfile" || path.endsWith("/getProfile") || path.endsWith("/getprofile") || path === "/user/profile") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          user: {
            id: 1,
            user_id: 1,
            first_name: "Sam",
            last_name: "Taylor",
            full_name: "Sam Taylor",
            email: "accounts.coastalspark@example.com",
            user_email: "accounts.coastalspark@example.com",
            mobile_number: "0491570006",
            phone: "0491 570 006",
            country_code: "+61",
            profile_pic: null,
            coupon_code: null,
            fitrec_id: null,
            allowed_features: ALL_DEMO_ALLOWED_FEATURES,
          },
          profile_pic: null,
        },
      },
    };
  }

  if (path === "/v1/text-message-setting") {
    return {
      status: 200,
      data: {
        success: true,
        data: { is_text_message: 0 },
      },
    };
  }

  if (path === "/v2/settings/audit-logs" || path === "/audit-logs") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          details: [
            {
              log_id: 1,
              performed_at: "29/10/2026 at 09:15 AM",
              performed_by: "Sam Taylor",
              module: "Sales",
              action: "Invoice created",
              description: "Created invoice INV-1051 for Bayside Fitness ($2,035.00)",
            },
            {
              log_id: 2,
              performed_at: "28/10/2026 at 02:40 PM",
              performed_by: "Sam Taylor",
              module: "Banking",
              action: "Transaction matched",
              description: "Matched ANZ bank credit of $2,420.00 to INV-1045",
            },
            {
              log_id: 3,
              performed_at: "28/10/2026 at 11:20 AM",
              performed_by: "Sam Taylor",
              module: "Time Tracker",
              action: "Time logged",
              description: "Logged 4.0h for Switchboard Upgrade & Sub-main Cabling",
            },
            {
              log_id: 4,
              performed_at: "27/10/2026 at 04:30 PM",
              performed_by: "Sam Taylor",
              module: "Expenses",
              action: "Expense created",
              description: "Recorded expense EXP-2041 ($748.00) from Middy's Electrical",
            },
            {
              log_id: 5,
              performed_at: "26/10/2026 at 01:10 PM",
              performed_by: "Sam Taylor",
              module: "Payroll",
              action: "Pay run submitted",
              description: "Submitted fortnightly pay run #14 for 2 employees ($2,840.50)",
            },
            {
              log_id: 6,
              performed_at: "25/10/2026 at 10:00 AM",
              performed_by: "Sam Taylor",
              module: "Scheduling",
              action: "Job scheduled",
              description: "Booked switchboard commissioning job for Bayside Fitness",
            },
            {
              log_id: 7,
              performed_at: "24/10/2026 at 03:15 PM",
              performed_by: "Sam Taylor",
              module: "Quotes",
              action: "Quote accepted",
              description: "Bayside Fitness accepted quote Q-2001 ($2,035.00)",
            },
            {
              log_id: 8,
              performed_at: "23/10/2026 at 08:30 AM",
              performed_by: "Sam Taylor",
              module: "Settings",
              action: "Profile loaded",
              description: "Loaded Coastal Spark Electrical business settings",
            },
          ],
          total: 8,
          total_pages: 1,
        },
      },
    };
  }

  if (path === "/v2/matching-rules/get" || path === "/matching-rules/get") {
    const fields = extractBodyFields(_body);
    const ruleId = String(fields.id || "1");
    const found = seed.matchingRules.find((r) => String(r.id) === ruleId) || seed.matchingRules[0];
    return {
      status: 200,
      data: {
        success: true,
        data: {
          rule: found,
        },
      },
    };
  }

  if (path === "/v2/transactions-matching-rules") {
    return {
      status: 200,
      data: {
        success: true,
        message: "Matching rules synced successfully.",
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * Reporting & Query POST Endpoints (Allowed in Demo Mode)
   * ------------------------------------------------------------------ */
  if (path === "/report") {
    const fields = extractBodyFields(_body);
    const reportTypeId = String(fields.report_type_id || params.report_type_id || "1");

    if (reportTypeId === "1") {
      // Profit & Loss
      const monthLabel = "Oct 2026";
      return {
        status: 200,
        data: {
          success: true,
          message: "Report generated successfully",
          gst_inclusive: fields.gst_inclusive === "true",
          columns: ["Account Name", monthLabel, "YTD Amount"],
          sections: [
            {
              section: "Income",
              rows: [
                { "Account Name": "Electrical Contracting Services", [monthLabel]: "$24,500.00", "YTD Amount": "$78,500.00" },
                { "Account Name": "Commercial Solar & Battery Installations", [monthLabel]: "$12,400.00", "YTD Amount": "$38,400.00" },
                { "Account Name": "Emergency Call-outs & Fault Repairs", [monthLabel]: "$4,200.00", "YTD Amount": "$14,800.00" },
              ],
              total: { "Account Name": "Total Income", [monthLabel]: "$41,100.00", "YTD Amount": "$131,700.00" },
            },
            {
              section: "Cost of Sales",
              rows: [
                { "Account Name": "Materials & Consumables (Middy's & Rexel)", [monthLabel]: "$9,800.00", "YTD Amount": "$32,400.00" },
                { "Account Name": "Subcontractor Electrician Services", [monthLabel]: "$3,200.00", "YTD Amount": "$11,200.00" },
              ],
              total: { "Account Name": "Total Cost of Sales", [monthLabel]: "$13,000.00", "YTD Amount": "$43,600.00" },
            },
            {
              section: "Gross Profit",
              rows: [],
              total: { "Account Name": "Gross Profit", [monthLabel]: "$28,100.00", "YTD Amount": "$88,100.00" },
            },
            {
              section: "Expenses",
              rows: [
                { "Account Name": "Motor Vehicle Operating & Fuel Expenses", [monthLabel]: "$1,450.00", "YTD Amount": "$4,650.00" },
                { "Account Name": "Tools, Test Equipment & PPE", [monthLabel]: "$780.00", "YTD Amount": "$2,890.00" },
                { "Account Name": "Public Liability & Business Insurance", [monthLabel]: "$420.00", "YTD Amount": "$1,680.00" },
                { "Account Name": "Software, Job Management & Telephone", [monthLabel]: "$360.00", "YTD Amount": "$1,440.00" },
                { "Account Name": "Accounting, Bookkeeping & Legal", [monthLabel]: "$450.00", "YTD Amount": "$1,800.00" },
                { "Account Name": "Advertising & Signage", [monthLabel]: "$280.00", "YTD Amount": "$950.00" },
              ],
              total: { "Account Name": "Total Operating Expenses", [monthLabel]: "$3,740.00", "YTD Amount": "$13,410.00" },
            },
            {
              section: "EBITDA",
              rows: [],
              total: { "Account Name": "Earnings before interest, tax and depreciation (EBITDA)", [monthLabel]: "$24,360.00", "YTD Amount": "$74,690.00" },
            },
            {
              section: " ",
              rows: [
                { "Account Name": "Depreciation Expense", [monthLabel]: "$850.00", "YTD Amount": "$3,400.00" },
                { "Account Name": "Interest Expense", [monthLabel]: "$120.00", "YTD Amount": "$480.00" },
                { "Account Name": "Profit Before Tax", [monthLabel]: "$23,390.00", "YTD Amount": "$70,810.00" },
                { "Account Name": "Income Tax Expense", [monthLabel]: "$4,680.00", "YTD Amount": "$14,160.00" },
              ],
              total: null,
            },
            {
              section: "Net Profit",
              rows: [],
              total: { "Account Name": "Net Profit", [monthLabel]: "$18,710.00", "YTD Amount": "$56,650.00" },
            },
          ],
        },
      };
    }

    if (reportTypeId === "2") {
      // Balance Sheet
      const years = ["2026", "2025"];
      return {
        status: 200,
        data: {
          success: true,
          message: "Balance Sheet generated successfully",
          columns: ["Account Name", ...years],
          sections: [
            {
              section: "Assets",
              rows: [
                { "Account Name": "ANZ Everyday Business Account", "2026": "$34,500.00", "2025": "$18,200.00" },
                { "Account Name": "Accounts Receivable (Trade Debtors)", "2026": "$14,200.00", "2025": "$9,800.00" },
                { "Account Name": "Motor Vehicles (2022 Toyota HiAce Van)", "2026": "$48,000.00", "2025": "$52,000.00" },
                { "Account Name": "Electrical Plant, Machinery & Test Tools", "2026": "$18,500.00", "2025": "$14,000.00" },
              ],
              total: { "Account Name": "Total Assets", "2026": "$115,200.00", "2025": "$94,000.00" },
            },
            {
              section: "Liabilities",
              rows: [
                { "Account Name": "Trade Creditors (Middy's & Rexel)", "2026": "$8,400.00", "2025": "$6,200.00" },
                { "Account Name": "GST Collected (Payable)", "2026": "$5,120.00", "2025": "$3,850.00" },
                { "Account Name": "PAYG Withholding Payable", "2026": "$2,400.00", "2025": "$1,900.00" },
                { "Account Name": "Superannuation Guarantee Payable", "2026": "$1,633.00", "2025": "$1,250.00" },
              ],
              total: { "Account Name": "Total Liabilities", "2026": "$17,553.00", "2025": "$13,200.00" },
            },
            {
              section: "Equity",
              rows: [
                { "Account Name": "Owner's Opening Capital", "2026": "$50,000.00", "2025": "$50,000.00" },
                { "Account Name": "Retained Earnings", "2026": "$10,707.00", "2025": "$5,200.00" },
                { "Account Name": "Current Year Earnings", "2026": "$36,940.00", "2025": "$25,600.00" },
              ],
              total: { "Account Name": "Total Equity", "2026": "$97,647.00", "2025": "$80,800.00" },
            },
          ],
          validation: {
            isBalanced: true,
            rows: [
              {
                financial_year: "2026",
                assets: 115200,
                liabilities: 17553,
                equity: 97647,
                difference: 0,
              },
              {
                financial_year: "2025",
                assets: 94000,
                liabilities: 13200,
                equity: 80800,
                difference: 0,
              },
            ],
          },
        },
      };
    }

    if (reportTypeId === "3") {
      // Asset Listing
      const assetRows = [
        [
          { key: "Asset Number", value: "AST-001" },
          { key: "Asset Name", value: "2022 Toyota HiAce LWB Service Van" },
          { key: "Date of Purchase", value: "12/03/2024" },
          { key: "Asset Value (excl. GST)", value: "$43,636.36" },
          { key: "GST Value", value: "$4,363.64" },
          { key: "Asset Total Value (incl. GST)", value: "$48,000.00" },
          { key: "Matched", value: "Yes" },
        ],
        [
          { key: "Asset Number", value: "AST-002" },
          { key: "Asset Name", value: "Milwaukee M18 Fuel 6-Piece Power Tool Kit" },
          { key: "Date of Purchase", value: "20/05/2024" },
          { key: "Asset Value (excl. GST)", value: "$2,272.73" },
          { key: "GST Value", value: "$227.27" },
          { key: "Asset Total Value (incl. GST)", value: "$2,500.00" },
          { key: "Matched", value: "Yes" },
        ],
        [
          { key: "Asset Number", value: "AST-003" },
          { key: "Asset Name", value: "Fluke 1664 FC Multifunction Electrical Installation Tester" },
          { key: "Date of Purchase", value: "15/07/2024" },
          { key: "Asset Value (excl. GST)", value: "$3,181.82" },
          { key: "GST Value", value: "$318.18" },
          { key: "Asset Total Value (incl. GST)", value: "$3,500.00" },
          { key: "Matched", value: "Yes" },
        ],
        [
          { key: "Asset Number", value: "AST-004" },
          { key: "Asset Name", value: "Brother PT-E550WVP Industrial Wireless Label Printer" },
          { key: "Date of Purchase", value: "05/09/2024" },
          { key: "Asset Value (excl. GST)", value: "$450.00" },
          { key: "GST Value", value: "$45.00" },
          { key: "Asset Total Value (incl. GST)", value: "$495.00" },
          { key: "Matched", value: "Yes" },
        ],
        [
          { key: "Asset Number", value: "AST-005" },
          { key: "Asset Name", value: "Apple iPad Pro 11-inch M2 On-Site Testing Tablet" },
          { key: "Date of Purchase", value: "10/11/2024" },
          { key: "Asset Value (excl. GST)", value: "$1,363.64" },
          { key: "GST Value", value: "$136.36" },
          { key: "Asset Total Value (incl. GST)", value: "$1,500.00" },
          { key: "Matched", value: "Yes" },
        ],
      ];
      return {
        status: 200,
        data: {
          success: true,
          data: assetRows,
          pagination: { total: assetRows.length, total_pages: 1 },
        },
      };
    }

    if (reportTypeId === "4") {
      // Transaction Listing
      const txListingRows = [
        [
          { key: "Transaction Date", value: "28/10/2026" },
          { key: "Type", value: "Sale" },
          { key: "Transaction Name", value: "INV-1051" },
          { key: "Client/Supplier", value: "Bayside Fitness" },
          { key: "Category Name", value: "Electrical Contracting" },
          { key: "Description", value: "Commercial Switchboard Upgrade deposit" },
          { key: "Amount (EX GST)", value: "$1,850.00" },
          { key: "Amount (INC. GST)", value: "$2,035.00" },
          { key: "Reconcile Date", value: "29/10/2026" },
        ],
        [
          { key: "Transaction Date", value: "27/10/2026" },
          { key: "Type", value: "Expense" },
          { key: "Transaction Name", value: "EXP-2041" },
          { key: "Client/Supplier", value: "Middy's Electrical - Burleigh" },
          { key: "Category Name", value: "Materials & Supplies" },
          { key: "Description", value: "3-phase isolators, breakers and orange circular cable" },
          { key: "Amount (EX GST)", value: "$680.00" },
          { key: "Amount (INC. GST)", value: "$748.00" },
          { key: "Reconcile Date", value: "28/10/2026" },
        ],
        [
          { key: "Transaction Date", value: "26/10/2026" },
          { key: "Type", value: "Sale" },
          { key: "Transaction Name", value: "INV-1045" },
          { key: "Client/Supplier", value: "Palm Grove Body Corporate" },
          { key: "Category Name", value: "Electrical Contracting" },
          { key: "Description", value: "Strata periodic test & emergency light certification" },
          { key: "Amount (EX GST)", value: "$2,200.00" },
          { key: "Amount (INC. GST)", value: "$2,420.00" },
          { key: "Reconcile Date", value: "27/10/2026" },
        ],
        [
          { key: "Transaction Date", value: "25/10/2026" },
          { key: "Type", value: "Sale" },
          { key: "Transaction Name", value: "INV-1042" },
          { key: "Client/Supplier", value: "Grace Holloway" },
          { key: "Category Name", value: "Electrical Contracting" },
          { key: "Description", value: "Downlight replacement & smoke alarm compliance certificate" },
          { key: "Amount (EX GST)", value: "$850.00" },
          { key: "Amount (INC. GST)", value: "$935.00" },
          { key: "Reconcile Date", value: "26/10/2026" },
        ],
        [
          { key: "Transaction Date", value: "24/10/2026" },
          { key: "Type", value: "Expense" },
          { key: "Transaction Name", value: "EXP-2038" },
          { key: "Client/Supplier", value: "Bunnings Trade - Burleigh Waters" },
          { key: "Category Name", value: "Tools & Equipment" },
          { key: "Description", value: "Step ladder, cable ties and masonry drill bits" },
          { key: "Amount (EX GST)", value: "$240.00" },
          { key: "Amount (INC. GST)", value: "$264.00" },
          { key: "Reconcile Date", value: "25/10/2026" },
        ],
        [
          { key: "Transaction Date", value: "22/10/2026" },
          { key: "Type", value: "Expense" },
          { key: "Transaction Name", value: "EXP-2035" },
          { key: "Client/Supplier", value: "Ampol Southport" },
          { key: "Category Name", value: "Motor Vehicle Expenses" },
          { key: "Description", value: "Diesel fuel for service van #1" },
          { key: "Amount (EX GST)", value: "$130.00" },
          { key: "Amount (INC. GST)", value: "$143.00" },
          { key: "Reconcile Date", value: "23/10/2026" },
        ],
      ];
      return {
        status: 200,
        data: {
          success: true,
          data: txListingRows,
          pagination: { total: txListingRows.length, total_pages: 1 },
        },
      };
    }

    if (reportTypeId === "8") {
      // Trial Balance
      return {
        status: 200,
        data: {
          success: true,
          message: "Trial Balance generated successfully",
          columns: ["Account Name", "Debit", "Credit"],
          sections: [
            {
              section: "Assets",
              rows: [
                { "Account Name": "ANZ Everyday Business Account", "Account Code": "100", Debit: "$34,500.00", Credit: "$0.00" },
                { "Account Name": "Trade Debtors (Accounts Receivable)", "Account Code": "120", Debit: "$14,200.00", Credit: "$0.00" },
                { "Account Name": "Motor Vehicles", "Account Code": "150", Debit: "$48,000.00", Credit: "$0.00" },
                { "Account Name": "Tools & Plant Equipment", "Account Code": "160", Debit: "$18,500.00", Credit: "$0.00" },
              ],
              total: { "Account Name": "Total Assets", Debit: "$115,200.00", Credit: "$0.00" },
            },
            {
              section: "Liabilities",
              rows: [
                { "Account Name": "Trade Creditors", "Account Code": "200", Debit: "$0.00", Credit: "$8,400.00" },
                { "Account Name": "GST Collected", "Account Code": "220", Debit: "$0.00", Credit: "$5,120.00" },
                { "Account Name": "PAYG Withholding Payable", "Account Code": "230", Debit: "$0.00", Credit: "$2,400.00" },
                { "Account Name": "Superannuation Payable", "Account Code": "240", Debit: "$0.00", Credit: "$1,633.00" },
              ],
              total: { "Account Name": "Total Liabilities", Debit: "$0.00", Credit: "$17,553.00" },
            },
            {
              section: "Equity",
              rows: [
                { "Account Name": "Owner's Equity Contribution", "Account Code": "300", Debit: "$0.00", Credit: "$50,000.00" },
                { "Account Name": "Retained Earnings", "Account Code": "310", Debit: "$0.00", Credit: "$10,707.00" },
              ],
              total: { "Account Name": "Total Equity", Debit: "$0.00", Credit: "$60,707.00" },
            },
            {
              section: "Revenue",
              rows: [
                { "Account Name": "Electrical Contracting Revenue", "Account Code": "400", Debit: "$0.00", Credit: "$54,200.00" },
                { "Account Name": "Solar & Battery Installation Revenue", "Account Code": "410", Debit: "$0.00", Credit: "$28,600.00" },
              ],
              total: { "Account Name": "Total Revenue", Debit: "$0.00", Credit: "$82,800.00" },
            },
            {
              section: "Expenses",
              rows: [
                { "Account Name": "Cost of Electrical Materials", "Account Code": "500", Debit: "$24,500.00", Credit: "$0.00" },
                { "Account Name": "Subcontractor Electricians", "Account Code": "510", Debit: "$8,200.00", Credit: "$0.00" },
                { "Account Name": "Motor Vehicle Running Costs", "Account Code": "520", Debit: "$4,200.00", Credit: "$0.00" },
                { "Account Name": "Tools, Insurance & Overheads", "Account Code": "530", Debit: "$8,960.00", Credit: "$0.00" },
              ],
              total: { "Account Name": "Total Expenses", Debit: "$45,860.00", Credit: "$0.00" },
            },
          ],
          validation: {
            total_debit: 161060,
            total_credit: 161060,
            difference: 0,
            balanced: true,
          },
        },
      };
    }

    if (reportTypeId === "9") {
      // Customer / Supplier
      const recType = String(fields.recordType || fields.record_type || params.recordType || "Client");
      let csRows: any[] = [];
      if (recType === "Invoice") {
        csRows = [
          [
            { key: "Contact Name", value: "Bayside Fitness" },
            { key: "Invoice RefID", value: "INV-1051" },
            { key: "Invoice Status", value: "Paid" },
            { key: "Invoice Date", value: "28/10/2026" },
            { key: "Invoice Due Date", value: "11/11/2026" },
            { key: "Invoice Value ($) - Excl. GST", value: "1850.00" },
            { key: "Invoice Value ($) - Incl. GST", value: "2035.00" },
            { key: "Invoice Description", value: "Main Switchboard Upgrade deposit" },
          ],
          [
            { key: "Contact Name", value: "Palm Grove Body Corporate" },
            { key: "Invoice RefID", value: "INV-1045" },
            { key: "Invoice Status", value: "Paid" },
            { key: "Invoice Date", value: "26/10/2026" },
            { key: "Invoice Due Date", value: "09/11/2026" },
            { key: "Invoice Value ($) - Excl. GST", value: "2200.00" },
            { key: "Invoice Value ($) - Incl. GST", value: "2420.00" },
            { key: "Invoice Description", value: "Emergency light discharge test & logbook certification" },
          ],
        ];
      } else if (recType === "Quote") {
        csRows = [
          [
            { key: "Contact Name", value: "Bayside Fitness" },
            { key: "Quote RefID", value: "Q-2001" },
            { key: "Quote Status", value: "Accepted" },
            { key: "Quote Date", value: "20/10/2026" },
            { key: "Quote Value ($) - Excl. GST", value: "1850.00" },
            { key: "Quote Value ($) - Incl. GST", value: "2035.00" },
            { key: "Quote Description", value: "Switchboard upgrade with 3-phase RCDs" },
          ],
        ];
      } else if (recType === "Expense") {
        csRows = [
          [
            { key: "Contact Name", value: "Middy's Electrical - Burleigh" },
            { key: "Expense Name", value: "EXP-2041" },
            { key: "Expense Category", value: "Materials & Supplies" },
            { key: "Expense Date", value: "27/10/2026" },
            { key: "Expense Value ($) - Excl. GST", value: "680.00" },
            { key: "Expense Value ($) - Incl. GST", value: "748.00" },
            { key: "Expense Description", value: "3-phase breakers & 16mm sub-main cabling" },
          ],
        ];
      } else if (recType === "Asset") {
        csRows = [
          [
            { key: "Contact Name", value: "Gold Coast Commercial Vans" },
            { key: "Asset Name", value: "2022 Toyota HiAce LWB Service Van" },
            { key: "Asset Category", value: "Motor Vehicles" },
            { key: "Asset Date", value: "12/03/2024" },
            { key: "Asset Value ($) - Excl. GST", value: "43636.36" },
            { key: "Asset Value ($) - Incl. GST", value: "48000.00" },
          ],
        ];
      } else {
        csRows = [
          [
            { key: "Contact Name", value: "Bayside Fitness" },
            { key: "Contact Type", value: "Client" },
            { key: "Contact BusinessName", value: "Bayside Fitness Centre" },
            { key: "Contact Mail", value: "accounts@baysidefitness.com.au" },
            { key: "Contact Mobile", value: "0412 345 678" },
            { key: "Contact Address", value: "88 Marine Parade, Southport QLD" },
            { key: "Contact Website", value: "https://baysidefitness.com.au" },
            { key: "Contact ABN", value: "51 824 753 556" },
          ],
          [
            { key: "Contact Name", value: "Palm Grove Body Corporate" },
            { key: "Contact Type", value: "Client" },
            { key: "Contact BusinessName", value: "Palm Grove CTS 4921" },
            { key: "Contact Mail", value: "strata@palmgrove.com.au" },
            { key: "Contact Mobile", value: "07 5592 1100" },
            { key: "Contact Address", value: "12 Palm Ave, Surfers Paradise QLD" },
            { key: "Contact Website", value: "" },
            { key: "Contact ABN", value: "72 109 883 412" },
          ],
          [
            { key: "Contact Name", value: "Middy's Electrical - Burleigh" },
            { key: "Contact Type", value: "Supplier" },
            { key: "Contact BusinessName", value: "Middendorp Electric Co Pty Ltd" },
            { key: "Contact Mail", value: "burleigh@middys.com.au" },
            { key: "Contact Mobile", value: "07 5535 4400" },
            { key: "Contact Address", value: "32 Kortum Dr, Burleigh Heads QLD" },
            { key: "Contact Website", value: "https://middys.com.au" },
            { key: "Contact ABN", value: "49 004 353 832" },
          ],
          [
            { key: "Contact Name", value: "Grace Holloway" },
            { key: "Contact Type", value: "Client" },
            { key: "Contact BusinessName", value: "Grace Holloway" },
            { key: "Contact Mail", value: "grace.h@example.com" },
            { key: "Contact Mobile", value: "0491 570 123" },
            { key: "Contact Address", value: "45 Pacific Blvd, Broadbeach QLD" },
            { key: "Contact Website", value: "" },
            { key: "Contact ABN", value: "" },
          ],
        ];
      }
      return {
        status: 200,
        data: {
          success: true,
          data: csRows,
          pagination: { total: csRows.length, total_pages: 1 },
        },
      };
    }

    if (reportTypeId === "10") {
      // Chart of Accounts
      const coaRows = [
        [
          { key: "Section", value: "Assets" },
          { key: "Account Code", value: "100" },
          { key: "Account Name", value: "ANZ Everyday Business Account" },
          { key: "GST Treatment", value: "BAS Excluded" },
          { key: "Transactions", value: 142 },
        ],
        [
          { key: "Section", value: "Assets" },
          { key: "Account Code", value: "120" },
          { key: "Account Name", value: "Accounts Receivable (Trade Debtors)" },
          { key: "GST Treatment", value: "BAS Excluded" },
          { key: "Transactions", value: 38 },
        ],
        [
          { key: "Section", value: "Assets" },
          { key: "Account Code", value: "150" },
          { key: "Account Name", value: "Motor Vehicles" },
          { key: "GST Treatment", value: "Capital" },
          { key: "Transactions", value: 4 },
        ],
        [
          { key: "Section", value: "Liabilities" },
          { key: "Account Code", value: "200" },
          { key: "Account Name", value: "Trade Creditors (Middy's/Rexel)" },
          { key: "GST Treatment", value: "BAS Excluded" },
          { key: "Transactions", value: 26 },
        ],
        [
          { key: "Section", value: "Liabilities" },
          { key: "Account Code", value: "220" },
          { key: "Account Name", value: "GST Collected" },
          { key: "GST Treatment", value: "GST" },
          { key: "Transactions", value: 45 },
        ],
        [
          { key: "Section", value: "Revenue" },
          { key: "Account Code", value: "400" },
          { key: "Account Name", value: "Electrical Contracting Services" },
          { key: "GST Treatment", value: "GST" },
          { key: "Transactions", value: 68 },
        ],
        [
          { key: "Section", value: "Revenue" },
          { key: "Account Code", value: "410" },
          { key: "Account Name", value: "Solar & Battery Installations" },
          { key: "GST Treatment", value: "GST" },
          { key: "Transactions", value: 18 },
        ],
        [
          { key: "Section", value: "Expenses" },
          { key: "Account Code", value: "500" },
          { key: "Account Name", value: "Electrical Materials & Consumables" },
          { key: "GST Treatment", value: "GST" },
          { key: "Transactions", value: 52 },
        ],
        [
          { key: "Section", value: "Expenses" },
          { key: "Account Code", value: "520" },
          { key: "Account Name", value: "Motor Vehicle Operating & Fuel" },
          { key: "GST Treatment", value: "GST" },
          { key: "Transactions", value: 34 },
        ],
      ];
      return {
        status: 200,
        data: {
          success: true,
          data: coaRows,
          pagination: { total: coaRows.length, total_pages: 1 },
        },
      };
    }

    if (reportTypeId === "11") {
      // Cash Flow
      const cashFlowRows = [
        [
          { key: "Date", value: "28/10/2026" },
          { key: "Transaction Type", value: "Deposit" },
          { key: "Account Code", value: "100" },
          { key: "Account Name", value: "Bayside Fitness - INV-1051" },
          { key: "Cash Flow Type", value: "Inflow" },
          { key: "Debit", value: "$2,035.00" },
          { key: "Credit", value: "$0.00" },
          { key: "Net Movement", value: "$2,035.00" },
        ],
        [
          { key: "Date", value: "27/10/2026" },
          { key: "Transaction Type", value: "Direct Debit" },
          { key: "Account Code", value: "500" },
          { key: "Account Name", value: "Middy's Electrical - EXP-2041" },
          { key: "Cash Flow Type", value: "Outflow" },
          { key: "Debit", value: "$0.00" },
          { key: "Credit", value: "$748.00" },
          { key: "Net Movement", value: "$-748.00" },
        ],
        [
          { key: "Date", value: "26/10/2026" },
          { key: "Transaction Type", value: "Deposit" },
          { key: "Account Code", value: "100" },
          { key: "Account Name", value: "Palm Grove Strata - INV-1045" },
          { key: "Cash Flow Type", value: "Inflow" },
          { key: "Debit", value: "$2,420.00" },
          { key: "Credit", value: "$0.00" },
          { key: "Net Movement", value: "$2,420.00" },
        ],
        [
          { key: "Date", value: "25/10/2026" },
          { key: "Transaction Type", value: "Card Purchase" },
          { key: "Account Code", value: "520" },
          { key: "Account Name", value: "Ampol Southport - Fuel" },
          { key: "Cash Flow Type", value: "Outflow" },
          { key: "Debit", value: "$0.00" },
          { key: "Credit", value: "$143.00" },
          { key: "Net Movement", value: "$-143.00" },
        ],
      ];
      return {
        status: 200,
        data: {
          success: true,
          data: cashFlowRows,
          pagination: { total: cashFlowRows.length, total_pages: 1 },
          summary: [
            { Label: "Operating Inflows", Amount: "$4,455.00" },
            { Label: "Operating Outflows", Amount: "$-891.00" },
            { Label: "Net Cash Flow", Amount: "$3,564.00" },
          ],
        },
      };
    }
  }

  if (path === "/report/gst-extract") {
    // BAS Extract Report
    return {
      status: 200,
      data: {
        success: true,
        Quarter: "Quarter 1",
        "Quarter Start Date": "01/07/2026",
        "Quarter End Date": "30/09/2026",
        tax_return: {
          template: "au_bas",
          return_name: "BAS",
          tax_label: "GST",
          tax_authority: "ATO",
          sections: [
            {
              title: "GST amounts you owe the tax office (Sales)",
              rows: [
                { box: "G1", label: "Total Sales (Incl. GST)", amount: 59620 },
                { box: "G3", label: "GST Free Sales", amount: 0 },
                { box: "G6", label: "Total Sales Applicable", amount: 59620 },
                { box: "G9", label: "GST on Sales", amount: 5420 },
              ],
            },
            {
              title: "GST amounts tax office owes you (Purchases)",
              rows: [
                { box: "G10", label: "Capital Purchase (Incl. GST)", amount: 48000 },
                { box: "G11", label: "Non-Capital Purchase (Incl. GST)", amount: 26400 },
                { box: "G14", label: "GST Free Purchases", amount: 120 },
                { box: "G20", label: "GST on Purchase", amount: 6764 },
              ],
            },
          ],
          summary: { direction: "refund", amount: 1344, net_tax: -1344 },
        },
        "GST amounts you owe the tax office (Sales)": {
          "Total Sales (Incl. GST)": { code: "G1", amount: "$59,620.00" },
          "GST Free Sales": { code: "G3", amount: "$0.00" },
          "Total Sales Applicable": { code: "G6", amount: "$59,620.00" },
          "GST on Sales": { code: "G9", amount: "$5,420.00" },
        },
        "GST amounts tax office owes you (Purchases)": {
          "Capital Purchase (Incl. GST)": { code: "G10", amount: "$48,000.00" },
          "Non-Capital Purchase (Incl. GST)": { code: "G11", amount: "$26,400.00" },
          "GST Free Purchases": { code: "G14", amount: "$120.00" },
          "GST on Purchase": { code: "G20", amount: "$6,764.00" },
        },
        "GST Refund/Payable": "$1,344.00 (Refund)",
        data: [
          [
            { key: "Type", value: "Invoice" },
            { key: "Transaction Name", value: "INV-1045" },
            { key: "Amount Ex GST", value: "$2,200.00" },
            { key: "GST Amount", value: "$220.00" },
            { key: "Amount Inc GST", value: "$2,420.00" },
            { key: "Date", value: "26/08/2026" },
            { key: "Reconcile Date", value: "27/08/2026" },
            { key: "Client/Supplier", value: "Palm Grove Body Corporate" },
            { key: "Category", value: "G1" },
            { key: "Category Name", value: "Sales" },
            { key: "Description", value: "Strata periodic test" },
          ],
          [
            { key: "Type", value: "Invoice" },
            { key: "Transaction Name", value: "INV-1042" },
            { key: "Amount Ex GST", value: "$850.00" },
            { key: "GST Amount", value: "$85.00" },
            { key: "Amount Inc GST", value: "$935.00" },
            { key: "Date", value: "25/08/2026" },
            { key: "Reconcile Date", value: "26/08/2026" },
            { key: "Client/Supplier", value: "Grace Holloway" },
            { key: "Category", value: "G1" },
            { key: "Category Name", value: "Sales" },
            { key: "Description", value: "Smoke alarm compliance check" },
          ],
          [
            { key: "Type", value: "Expense" },
            { key: "Transaction Name", value: "EXP-2038" },
            { key: "Amount Ex GST", value: "$680.00" },
            { key: "GST Amount", value: "$68.00" },
            { key: "Amount Inc GST", value: "$748.00" },
            { key: "Date", value: "24/08/2026" },
            { key: "Reconcile Date", value: "25/08/2026" },
            { key: "Client/Supplier", value: "Middy's Electrical" },
            { key: "Category", value: "G11" },
            { key: "Category Name", value: "Materials & Supplies" },
            { key: "Description", value: "Electrical switchgear" },
          ],
        ],
      },
    };
  }

  if (path === "/tax/getFinancialYears" || path === "/tax/financial-years") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          financialYear: [
            { id: 1, start_year: "2026", end_year: "2027", start_date: "2026-07-01", end_date: "2027-06-30" },
            { id: 2, start_year: "2025", end_year: "2026", start_date: "2025-07-01", end_date: "2026-06-30" },
            { id: 3, start_year: "2024", end_year: "2025", start_date: "2024-07-01", end_date: "2025-06-30" },
          ],
        },
      },
    };
  }

  if (path === "/calendar/url") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          authUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=mock_demo&scope=calendar",
        },
      },
    };
  }

  if (path === "/v2/report-packs/preview") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          html: "<div style='padding:20px;font-family:sans-serif;'><h1>Coastal Spark Electrical</h1><p>Demo Report Pack Preview</p></div>",
        },
      },
    };
  }

  if (path === "/v2/report-packs/cover-image") {
    return {
      status: 200,
      data: {
        success: true,
        data: { url: "/logo.png" },
      },
    };
  }

  // Timer write actions that can be simulated smoothly in Demo mode:
  if (path === "/time-tracking/start") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          id: "log-live",
          start_time: new Date().toISOString(),
          status: "running",
          hourly_rate: 110,
        },
      },
    };
  }

  if (path === "/time-tracking" && normMethod === "POST") {
    return {
      status: 200,
      data: {
        success: true,
        message: "Time entry saved successfully.",
      },
    };
  }

  if (path === "/time-tracking/generate-pdf") {
    return {
      status: 200,
      data: {
        success: true,
        data: { url: "#" },
      },
    };
  }

  if (path === "/credit-note/generate") {
    return {
      status: 200,
      data: {
        success: true,
        data: "CRN-0004",
      },
    };
  }

  if (path === "/v2/spm/keys/generate") {
    return {
      status: 200,
      data: {
        success: true,
        data: { key: "spm_live_coastalspark_demo_key" },
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * WRITE OPERATIONS — Blocked in Demo Mode
   * ------------------------------------------------------------------ */
  if (["POST", "PUT", "PATCH", "DELETE"].includes(normMethod)) {
    notifyReadOnly();
    return {
      status: 200, // Return 200 with success: false so app error handling catches it without uncaught promise rejection
      data: {
        success: false,
        message: "Demo mode is read-only. Changes cannot be saved.",
        data: null,
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * READ OPERATIONS (GET)
   * ------------------------------------------------------------------ */

  // Business profile & settings
  if (path === "/businesses") {
    return {
      status: 200,
      data: {
        success: true,
        data: [demoApiBusiness],
      },
    };
  }

  if (path === "/businesses/1" || path === "/businesses/current" || path.startsWith("/businesses/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: demoApiBusiness,
      },
    };
  }

  if (path === "/countries") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            iso2: "AU",
            name: "Australia",
            currency: "AUD",
            currency_symbol: "$",
            calling_code: "+61",
            default_tax_rate: 10,
            tax_label: "GST",
            registration_label: "ABN",
            is_live: 1,
          },
          {
            iso2: "NZ",
            name: "New Zealand",
            currency: "NZD",
            currency_symbol: "$",
            calling_code: "+64",
            default_tax_rate: 15,
            tax_label: "GST",
            registration_label: "NZBN",
            is_live: 1,
          },
          {
            iso2: "GB",
            name: "United Kingdom",
            currency: "GBP",
            currency_symbol: "£",
            calling_code: "+44",
            default_tax_rate: 20,
            tax_label: "VAT",
            registration_label: "CRN",
            is_live: 1,
          },
        ],
      },
    };
  }

  if (path === "/countries/detect") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          iso2: "AU",
          name: "Australia",
          currency: "AUD",
          currency_symbol: "$",
        },
      },
    };
  }

  if (
    path === "/v2/settings/tax-settings" ||
    path === "/settings/tax-settings" ||
    path.endsWith("/tax-settings")
  ) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          tax_settings: {
            id: 1,
            tax_name: "GST",
            tax_percentage: "10",
            is_default: 1,
            country_rate: 10,
          },
        },
      },
    };
  }

  if (
    path === "/v2/settings/get-branding" ||
    path === "/v2/settings/save-branding" ||
    path === "/save-branding" ||
    path === "/tenant/me/branding"
  ) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          brand_color: "#1e3a8a",
          content_color: "#0f172a",
          logo: null,
          show_logo_on_invoice: 1,
          phone_enabled: 1,
          phone: "0491 570 006",
          website_enabled: 1,
          website: "https://coastalspark.example.com",
        },
      },
    };
  }

  if (path === "/v2/settings/get-seq-numbers") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          invoice_prefix: "INV-",
          invoice_next_number: 1056,
          quote_prefix: "Q-",
          quote_next_number: 1017,
        },
      },
    };
  }

  if (path === "/v2/communication-preferences") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          notification_setting_details: [
            { module: "invoice", is_email: 1 },
            { module: "quote", is_email: 1 },
            { module: "weekly_summary", is_email: 1 },
          ],
          reminder_setting: {
            inv_before: 1,
            inv_after: 1,
            quo_before: 1,
          },
        },
      },
    };
  }

  if (path === "/v2/user/notification" || path === "/user/notification") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          notification_details: seed.notifications,
          total: seed.notifications.length,
        },
      },
    };
  }

  if (path.startsWith("/v2/user/notification/") && path.endsWith("/read")) {
    return {
      status: 200,
      data: {
        success: true,
        message: "Notification marked as read",
      },
    };
  }

  if (path === "/subscription/plans" || path === "/subscription/catalogue") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          packages: [
            {
              id: 1,
              slug: "pro",
              name: "Pro Plan",
              interval: "monthly",
              price: 29,
              monthly_price: 29,
              currency: "AUD",
              includes: [
                "Invoicing",
                "Expenses",
                "Quotes",
                "Banking",
                "GST / BAS",
                "Projects",
                "Time Tracker",
                "Assets",
                "KM Tracker",
              ],
              excludes: [],
            },
            {
              id: 2,
              slug: "pro_annual",
              name: "Pro Plan (Annual)",
              interval: "annual",
              price: 290,
              monthly_price: 24.16,
              currency: "AUD",
              includes: [
                "Invoicing",
                "Expenses",
                "Quotes",
                "Banking",
                "GST / BAS",
                "Projects",
                "Time Tracker",
                "Assets",
                "KM Tracker",
              ],
              excludes: [],
            },
          ],
          addons: [
            {
              id: 1,
              slug: "project",
              name: "Projects / milestones",
              interval: "monthly",
              price: 10,
              monthly_price: 10,
              currency: "AUD",
            },
            {
              id: 2,
              slug: "booking",
              name: "Scheduling",
              interval: "monthly",
              price: 6,
              monthly_price: 6,
              currency: "AUD",
            },
            {
              id: 3,
              slug: "time",
              name: "Time tracker",
              interval: "monthly",
              price: 6,
              monthly_price: 6,
              currency: "AUD",
            },
            {
              id: 4,
              slug: "investment",
              name: "Investment property",
              interval: "monthly",
              price: 12,
              monthly_price: 12,
              currency: "AUD",
            },
            {
              id: 5,
              slug: "km",
              name: "KM tracker",
              interval: "monthly",
              price: 5,
              monthly_price: 5,
              currency: "AUD",
            },
            {
              id: 6,
              slug: "assets-advanced",
              name: "Assets",
              interval: "monthly",
              price: 8,
              monthly_price: 8,
              currency: "AUD",
            },
          ],
        },
      },
    };
  }

  if (path === "/subscription/my-subscription") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          subscription_detail: {
            status: "active",
            platform: "stripe",
            plan_interval: "monthly",
            current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
            addons: [
              "project",
              "booking",
              "time",
              "investment",
              "km",
              "assets-advanced",
              "payroll",
              "proposals",
              "reputation",
              "tax-estimator",
            ],
          },
          plan: {
            tier: "pro",
            name: "Sole Pro Plan",
            slug: "pro",
            price: 29.0,
          },
          billing: {
            plan_price: 29.0,
            addons_total: 34.0,
            next_billing_amount: 63.0,
            effective_next_billing_amount: 63.0,
          },
          requires_first_subscription: false,
          subscription: demoApiBusiness.subscription,
        },
      },
    };
  }

  if (path === "/subscription/history") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          invoices: [],
        },
      },
    };
  }

  if (path === "/industry") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          { id: 1, name: "Electrical services" },
          { id: 2, name: "Trades & Construction" },
          { id: 3, name: "Professional Services" },
        ],
      },
    };
  }

  if (path === "/account-categories/list" || path === "/account-categories") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          account_categories: seed.accountCategories,
        },
      },
    };
  }

  // Price List / Custom Products & Tracked Inventory
  if (path === "/custom-product/stats") {
    const tracked = seed.customProducts.filter((p: any) => p.inventory_flag === 1);
    const totalValue = tracked.reduce(
      (sum: number, p: any) => sum + (Number(p.cost_price) || 0) * (Number(p.inventory_count) || 0),
      0,
    );
    return {
      status: 200,
      data: {
        success: true,
        data: {
          total_items: tracked.length,
          low_stock: tracked.filter((p: any) => (p.inventory_count || 0) <= (p.low_stock_threshold || 5)).length,
          out_of_stock: tracked.filter((p: any) => (p.inventory_count || 0) === 0).length,
          total_value: Math.round(totalValue * 100) / 100,
        },
      },
    };
  }

  if (path.startsWith("/custom-product/") && path.includes("/history")) {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: "1",
            date: "2026-10-15T09:30:00.000Z",
            change: "+20",
            reason: "Stock receipt PO-401",
            quantity_on_hand: 24,
          },
        ],
      },
    };
  }

  if (path.startsWith("/custom-product/") && !path.includes("/adjust")) {
    const id = path.replace("/custom-product/", "");
    const prod = seed.customProducts.find((p: any) => String(p.id) === id) || seed.customProducts[0];
    return {
      status: 200,
      data: {
        success: true,
        data: prod,
      },
    };
  }

  if (
    path === "/custom-product" ||
    path === "/custom-product/list" ||
    path === "/products" ||
    path === "/services" ||
    path === "/services/all"
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit || params.page_size) || 500;
    const start = (page - 1) * limit;

    return {
      status: 200,
      data: {
        success: true,
        data: seed.customProducts.slice(start, start + limit),
        total: seed.customProducts.length,
      },
    };
  }

  // Contacts (Clients & Suppliers)
  if (path === "/client/v2" || path === "/client") {
    const isSupplier = params.type === "2";
    const isDefault = params["filter_by[scope]"] === "default";
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 25;
    const search = String(params.searchQuery || "").toLowerCase();

    let rawList = isSupplier ? seed.suppliers : seed.clients;
    if (isDefault) rawList = [];

    let filtered = rawList.map((item: any) => ({
      id: String(item.id),
      business_name: item.kind === "residential" ? null : item.name,
      email: item.email,
      type: isSupplier ? "Supplier" : "Client",
      created_at: "01-05-2026",
      notes: "",
      primary_contact: {
        name: item.contact,
        email: item.email,
        country_calling_code: "+61",
        phone_number: "0491 570 006",
      },
      address_line1: "14 Ferry Road",
      city: item.city || "Southport",
      country: "Australia",
    }));

    if (search) {
      filtered = filtered.filter(
        (c) =>
          (c.business_name && c.business_name.toLowerCase().includes(search)) ||
          (c.primary_contact?.name && c.primary_contact.name.toLowerCase().includes(search)) ||
          c.email.toLowerCase().includes(search),
      );
    }

    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    return {
      status: 200,
      data: {
        success: true,
        data: paginated,
        meta: {
          all: seed.clients.length + seed.suppliers.length,
          total_clients: seed.clients.length,
          total_suppliers: seed.suppliers.length,
        },
        pagination: {
          total: filtered.length,
        },
      },
    };
  }

  // Single Contact Detail
  if (path.startsWith("/client/")) {
    const id = path.replace("/client/", "");
    const found = [...seed.clients, ...seed.suppliers].find((c) => String(c.id) === id) || seed.clients[0];
    return {
      status: 200,
      data: {
        success: true,
        data: {
          id: Number(found.id),
          business_name: found.name,
          company_type: "business",
          email: found.email,
          city: "city" in found ? found.city : "Southport",
          country: "Australia",
          primary_contact: {
            id: Number(found.contactId),
            name: found.contact,
            email: found.email,
          },
          contacts: [
            {
              id: Number(found.contactId),
              name: found.contact,
              email: found.email,
              is_primary: 1,
            },
          ],
        },
      },
    };
  }

  // Invoice Status Counts
  if (path === "/invoice/invoices/status-counts") {
    const counts = {
      all: seed.invoices.length,
      draft: seed.invoices.filter((i) => i.status === "draft").length,
      due: seed.invoices.filter((i) => i.status === "due").length,
      overdue: seed.invoices.filter((i) => i.status === "overdue").length,
      paid: seed.invoices.filter((i) => i.status === "paid").length,
      partially_paid: seed.invoices.filter((i) => i.status === "partially_paid").length,
    };
    return {
      status: 200,
      data: { success: true, data: counts },
    };
  }

  // Invoices List
  if (path === "/invoice/invoices" || path === "/invoice/list") {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.page_size || params.limit) || 25;
    const statusFilter = params["filter_by[status]"] || params.status;
    const search = String(params["filter_by[search]"] || params.search || "").toLowerCase();

    let filtered = seed.invoices;

    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter((inv) => inv.status.toLowerCase() === String(statusFilter).toLowerCase());
    }

    if (search) {
      filtered = filtered.filter(
        (inv) =>
          inv.invoice_no.toLowerCase().includes(search) ||
          inv.client.name.toLowerCase().includes(search) ||
          inv.description.toLowerCase().includes(search),
      );
    }

    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return {
      status: 200,
      data: {
        success: true,
        data: {
          invoice_details: paginated,
          total: filtered.length,
          max_price: 5000,
          max_due_balance: 3500,
        },
      },
    };
  }

  // Invoice number check
  if (path === "/invoice/invoice-no/check" || path === "/v2/invoice-no/check" || path.endsWith("/invoice-no/check")) {
    return {
      status: 200,
      data: {
        success: true,
        is_unique: true,
        data: { is_unique: true },
      },
    };
  }

  // Single Invoice Detail
  if (path.startsWith("/invoice/invoices/") || (path.startsWith("/invoice/") && !path.includes("/list") && !path.includes("/invoice-no"))) {
    const id = path.split("/").pop() || "";
    const inv = seed.invoices.find((i) => String(i.invoice_id) === id || String(i.id) === id) || seed.invoices[0];
    return {
      status: 200,
      data: {
        success: true,
        data: {
          ...inv,
          invoice: inv,
          template_id: "1",
        },
      },
    };
  }

  // Quotes Status Counts
  if (path === "/quote/quotes/status-counts" || path === "/quote/status-counts") {
    const counts = {
      all: seed.quotes.length,
      open: seed.quotes.filter((q) => q.status === "open").length,
      accepted: seed.quotes.filter((q) => q.status === "accepted").length,
      declined: seed.quotes.filter((q) => q.status === "declined").length,
      expired: seed.quotes.filter((q) => q.status === "expired").length,
      converted: seed.quotes.filter((q) => q.status === "converted").length,
      draft: 0,
      stats: {
        year: {
          billed: { count: 8, amount: 24500 },
          open: { count: 4, accepted: 2, amount: 9800 },
          lost: { count: 4, amount: 6200 },
        },
        month: {
          billed: { count: 2, amount: 5400 },
          open: { count: 2, accepted: 1, amount: 4850 },
          lost: { count: 1, amount: 1200 },
        },
      },
    };
    return {
      status: 200,
      data: { success: true, data: counts },
    };
  }

  if (path === "/v2/quote-no") {
    return {
      status: 200,
      data: {
        quote_no: `Q-10${seed.quotes.length + 1}`,
        data: { quote_no: `Q-10${seed.quotes.length + 1}` },
      },
    };
  }

  if (path === "/quote/default") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          notes:
            "Payment due within 14 days of acceptance. All electrical work compliant with AS/NZS 3000:2018 Wiring Rules.",
          expire_after: 30,
        },
      },
    };
  }

  if (path === "/quote/statistics") {
    const totalValue = seed.quotes.reduce((sum, q) => sum + (Number(q.total) || 0), 0);
    const acceptedValue = seed.quotes
      .filter((q) => q.status === "accepted")
      .reduce((sum, q) => sum + (Number(q.total) || 0), 0);
    return {
      status: 200,
      data: {
        success: true,
        data: {
          total_quotes: seed.quotes.length,
          total_value: totalValue,
          accepted_value: acceptedValue,
          acceptance_rate: 68.5,
        },
      },
    };
  }

  // Quotes List
  if (path === "/quote" || path === "/quote/quotes" || path === "/quote/list") {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.page_size || params.limit) || 25;
    const statusFilter = params["filter_by[status]"] || params.status;

    let filtered = seed.quotes;
    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter((q) => q.status.toLowerCase() === String(statusFilter).toLowerCase());
    }

    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return {
      status: 200,
      data: {
        success: true,
        data: {
          quote_details: paginated,
          total: filtered.length,
        },
      },
    };
  }

  // Single Quote Detail
  if (
    path.startsWith("/quote/quotes/") ||
    (path.startsWith("/quote/") &&
      !path.includes("/list") &&
      path !== "/quote/status-counts" &&
      path !== "/quote/statistics" &&
      path !== "/quote/default")
  ) {
    const id = path.split("/").pop() || "";
    const q = seed.quotes.find((item) => String(item.quote_id) === id || String(item.id) === id) || seed.quotes[0];
    return {
      status: 200,
      data: {
        success: true,
        data: {
          ...q,
          quote: q,
        },
      },
    };
  }

  // Expense Statistics (Must precede single expense detail)
  if (path === "/expense/statistics") {
    const isMonth = params.period === "month";
    return {
      status: 200,
      data: {
        success: true,
        data: {
          has_previous_data: true,
          total_expenses: {
            total_amount: isMonth ? 4850.0 : 58920.0,
            percentage_change: isMonth ? 4.2 : 6.8,
          },
          reconciled_expenses: {
            total_amount: isMonth ? 3950.0 : 49820.0,
            percentage_change: isMonth ? 6.1 : 8.4,
          },
          pending_expenses: {
            total_amount: isMonth ? 900.0 : 9100.0,
            percentage_change: isMonth ? -2.3 : -1.5,
          },
        },
      },
    };
  }

  // Expenses List
  if (path === "/expense/list" || path === "/expense/expenses" || path === "/v2/expense") {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.page_size) || 25;
    const search = String(params["filter_by[name]"] || "").toLowerCase();

    let filtered = seed.expenses;
    if (search) {
      filtered = filtered.filter(
        (exp) =>
          exp.name.toLowerCase().includes(search) ||
          exp.client.name.toLowerCase().includes(search),
      );
    }

    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return {
      status: 200,
      data: {
        success: true,
        data: {
          expense_details: paginated,
          total: filtered.length,
        },
      },
    };
  }

  // Single Expense Detail
  if (path.startsWith("/expense/") && path !== "/expense/statistics") {
    const id = path.replace("/expense/", "");
    const exp = seed.expenses.find((e) => String(e.expense_id) === id || String(e.id) === id) || seed.expenses[0];
    return {
      status: 200,
      data: {
        success: true,
        data: exp,
      },
    };
  }

  // Projects
  if (path === "/project" || path === "/projects" || path === "/project/all") {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.projects,
        pagination: { total: seed.projects.length },
        meta: {
          all: seed.projects.length,
          inprogress: seed.projects.filter((p) => p.status === "inprogress").length,
          completed: seed.projects.filter((p) => p.status === "completed").length,
          draft: seed.projects.filter((p) => p.status === "draft").length,
        },
      },
    };
  }

  if (path.startsWith("/project/") && !path.includes("/job")) {
    const id = path.replace("/project/", "");
    const project = seed.projects.find((p) => p.id === id) || seed.projects[0];
    return {
      status: 200,
      data: {
        success: true,
        data: project,
      },
    };
  }

  if (path.includes("/project-job") || path.includes("/jobs")) {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.projects.flatMap((p) => p.jobs),
      },
    };
  }

  // KM Tracker
  if (path === "/km-tracker/settings") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          calculation_method: "cents_per_kilometre",
          rate_per_km: seed.kmRate,
          vehicle_details: [seed.vehicle],
        },
      },
    };
  }

  if (path === "/km-tracker/rules") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          cents_per_kilometre: { rate: seed.kmRate },
        },
      },
    };
  }

  if (path === "/km-tracker/stats") {
    const totalKm = seed.kmTrips.reduce((acc, t) => acc + t.distance, 0);
    const totalDeductions = seed.kmTrips.reduce((acc, t) => acc + t.amount, 0);
    return {
      status: 200,
      data: {
        success: true,
        data: {
          total_trips: seed.kmTrips.length,
          total_distance_km: totalKm,
          total_deduction: totalDeductions,
        },
      },
    };
  }

  if (path === "/km-tracker") {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 25;
    const start = (page - 1) * limit;
    return {
      status: 200,
      data: {
        success: true,
        data: seed.kmTrips.slice(start, start + limit),
        pagination: { total: seed.kmTrips.length },
      },
    };
  }

  // Assets
  if (path === "/assets" || path === "/asset") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          asset_details: seed.assets,
          total: seed.assets.length,
        },
      },
    };
  }

  if (path.startsWith("/asset-registry")) {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          { id: "1", name: "Vehicle" },
          { id: "2", name: "Tools" },
          { id: "3", name: "Equipment" },
          { id: "4", name: "Technology" },
        ],
      },
    };
  }

  // Calendar & Scheduling
  if (path === "/calendar/list") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: "1",
            email: "sam@coastalspark.com.au",
            calendar_id: "c_primary",
            is_default: true,
            color: "#6366f1",
          },
        ],
      },
    };
  }

  if (path === "/calendar/search") {
    const q = String(params.search || "").toLowerCase();
    const filtered = q
      ? seed.calendarEvents.filter((e: any) =>
          String(e.title || e.task_name || "").toLowerCase().includes(q) ||
          String(e.task_details || "").toLowerCase().includes(q),
        )
      : seed.calendarEvents;
    return {
      status: 200,
      data: {
        success: true,
        data: filtered,
      },
    };
  }

  if (path === "/calendar") {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.calendarEvents,
      },
    };
  }

  if (path.startsWith("/calendar/") && !path.includes("/list") && !path.includes("/search") && !path.includes("/url")) {
    const id = path.replace("/calendar/", "");
    const event = seed.calendarEvents.find((e: any) => String(e.id) === id) || seed.calendarEvents[0];
    return {
      status: 200,
      data: {
        success: true,
        data: event,
      },
    };
  }

  if (path === "/stage" || path === "/stage/list" || path === "/stage/default-seed") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          { id: "1", name: "To Do", order: 1, color: "#94a3b8" },
          { id: "2", name: "In Progress", order: 2, color: "#38bdf8" },
          { id: "3", name: "Review / Testing", order: 3, color: "#f59e0b" },
          { id: "4", name: "Invoiced", order: 4, color: "#10b981" },
        ],
      },
    };
  }

  // Schedule / Bookings
  if (path.startsWith("/schedule")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          links: seed.bookingLinks,
          bookings: seed.bookings,
        },
      },
    };
  }

  // Task Planner & Kanban Board
  if (path === "/planner") {
    const stages = [
      {
        id: "1",
        name: "To Do",
        order: 1,
        color: "#94a3b8",
        tasks: [
          {
            id: "t-1",
            title: "Palm Grove Strata - Emergency Light Test",
            task_name: "Palm Grove Strata - Emergency Light Test",
            due_date: "2026-11-04",
            stage_id: "1",
            client_id: "102",
            client: { id: 102, name: "Palm Grove Body Corporate" },
            amount: 380,
            is_billable: true,
            priority: "medium",
          },
          {
            id: "t-2",
            title: "Grace Holloway - Smoke Alarm Audit",
            task_name: "Grace Holloway - Smoke Alarm Audit",
            due_date: "2026-11-05",
            stage_id: "1",
            client_id: "103",
            client: { id: 103, name: "Grace Holloway" },
            amount: 180,
            is_billable: true,
            priority: "low",
          },
        ],
      },
      {
        id: "2",
        name: "In Progress",
        order: 2,
        color: "#38bdf8",
        tasks: [
          {
            id: "t-3",
            title: "Bayside Fitness - Switchboard Commissioning",
            task_name: "Bayside Fitness - Switchboard Commissioning",
            due_date: "2026-11-03",
            stage_id: "2",
            client_id: "101",
            client: { id: 101, name: "Bayside Fitness" },
            amount: 550,
            is_billable: true,
            priority: "high",
          },
        ],
      },
      {
        id: "3",
        name: "Review / Testing",
        order: 3,
        color: "#f59e0b",
        tasks: [
          {
            id: "t-4",
            title: "Apex Logistics - EV Fast Charger 22kW Installation",
            task_name: "Apex Logistics - EV Fast Charger 22kW Installation",
            due_date: "2026-11-06",
            stage_id: "3",
            client_id: "104",
            client: { id: 104, name: "Apex Logistics" },
            amount: 2200,
            is_billable: true,
            priority: "high",
          },
        ],
      },
      {
        id: "4",
        name: "Invoiced",
        order: 4,
        color: "#10b981",
        tasks: [
          {
            id: "t-5",
            title: "Tweed Coast Vet - Dedicated Dental Circuit",
            task_name: "Tweed Coast Vet - Dedicated Dental Circuit",
            due_date: "2026-11-02",
            stage_id: "4",
            client_id: "105",
            client: { id: 105, name: "Tweed Coast Veterinary Clinic" },
            amount: 1100,
            is_billable: true,
            priority: "medium",
          },
        ],
      },
    ];

    return {
      status: 200,
      data: {
        success: true,
        data: stages,
      },
    };
  }

  if (path === "/planner/tasks") {
    const allTasks = [
      {
        id: "t-1",
        title: "Palm Grove Strata - Emergency Light Test",
        task_name: "Palm Grove Strata - Emergency Light Test",
        due_date: "2026-11-04",
        stage_id: "1",
        stage_name: "To Do",
        client_id: "102",
        client: { id: 102, name: "Palm Grove Body Corporate" },
        amount: 380,
        is_billable: true,
        priority: "medium",
      },
      {
        id: "t-2",
        title: "Grace Holloway - Smoke Alarm Audit",
        task_name: "Grace Holloway - Smoke Alarm Audit",
        due_date: "2026-11-05",
        stage_id: "1",
        stage_name: "To Do",
        client_id: "103",
        client: { id: 103, name: "Grace Holloway" },
        amount: 180,
        is_billable: true,
        priority: "low",
      },
      {
        id: "t-3",
        title: "Bayside Fitness - Switchboard Commissioning",
        task_name: "Bayside Fitness - Switchboard Commissioning",
        due_date: "2026-11-03",
        stage_id: "2",
        stage_name: "In Progress",
        client_id: "101",
        client: { id: 101, name: "Bayside Fitness" },
        amount: 550,
        is_billable: true,
        priority: "high",
      },
      {
        id: "t-4",
        title: "Apex Logistics - EV Fast Charger 22kW Installation",
        task_name: "Apex Logistics - EV Fast Charger 22kW Installation",
        due_date: "2026-11-06",
        stage_id: "3",
        stage_name: "Review / Testing",
        client_id: "104",
        client: { id: 104, name: "Apex Logistics" },
        amount: 2200,
        is_billable: true,
        priority: "high",
      },
      {
        id: "t-5",
        title: "Tweed Coast Vet - Dedicated Dental Circuit",
        task_name: "Tweed Coast Vet - Dedicated Dental Circuit",
        due_date: "2026-11-02",
        stage_id: "4",
        stage_name: "Invoiced",
        client_id: "105",
        client: { id: 105, name: "Tweed Coast Veterinary Clinic" },
        amount: 1100,
        is_billable: true,
        priority: "medium",
      },
    ];

    return {
      status: 200,
      data: {
        success: true,
        data: {
          rows: allTasks,
          total: allTasks.length,
        },
      },
    };
  }

  if (path.startsWith("/planner/stage/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          cards: [],
          nextCursor: null,
        },
      },
    };
  }

  // Time Tracker Endpoints
  if (path === "/tasks/time-logs" || path === "/v2/tasks/time-logs") {
    const timeTasks = [
      {
        task_id: "1",
        task_name: "Switchboard Upgrade & Sub-main Cabling",
        charge_type: "hourly",
        rate: 110.0,
        is_billable: 1,
        project_id: "1",
        project_name: "Switchboard Upgrade",
        job_id: "1",
        job_name: "Main Distribution Board",
        client_id: "101",
        client_name: "Bayside Fitness",
        contact_id: "101",
        contact_name: "Bayside Fitness",
        total_duration_minutes: 480,
        total_amount: 880.0,
        time_entries: [
          {
            id: "tl-1",
            log_date: "2026-10-27",
            start_time: "08:00",
            end_time: "12:00",
            created_at: "2026-10-27T08:00:00Z",
            duration_minutes: 240,
            amount: 440.0,
            status: "stopped",
            is_invoiced: 0,
            invoice_id: null,
            invoice_no: "",
          },
          {
            id: "tl-2",
            log_date: "2026-10-28",
            start_time: "08:30",
            end_time: "12:30",
            created_at: "2026-10-28T08:30:00Z",
            duration_minutes: 240,
            amount: 440.0,
            status: "stopped",
            is_invoiced: 0,
            invoice_id: null,
            invoice_no: "",
          },
        ],
      },
      {
        task_id: "2",
        task_name: "Emergency Light Periodic Testing & Discharge Test",
        charge_type: "hourly",
        rate: 95.0,
        is_billable: 1,
        project_id: "2",
        project_name: "Strata Compliance 2026",
        job_id: null,
        job_name: "",
        client_id: "102",
        client_name: "Palm Grove Body Corporate",
        contact_id: "102",
        contact_name: "Palm Grove Body Corporate",
        total_duration_minutes: 240,
        total_amount: 380.0,
        time_entries: [
          {
            id: "tl-3",
            log_date: "2026-10-26",
            start_time: "09:00",
            end_time: "13:00",
            created_at: "2026-10-26T09:00:00Z",
            duration_minutes: 240,
            amount: 380.0,
            status: "stopped",
            is_invoiced: 1,
            invoice_id: "3",
            invoice_no: "INV-1045",
          },
        ],
      },
      {
        task_id: "3",
        task_name: "Smoke Alarm Interconnect & Compliance Audit",
        charge_type: "hourly",
        rate: 120.0,
        is_billable: 1,
        project_id: null,
        project_name: "",
        job_id: null,
        job_name: "",
        client_id: "103",
        client_name: "Grace Holloway",
        contact_id: "103",
        contact_name: "Grace Holloway",
        total_duration_minutes: 150,
        total_amount: 300.0,
        time_entries: [
          {
            id: "tl-4",
            log_date: "2026-10-25",
            start_time: "14:00",
            end_time: "16:30",
            created_at: "2026-10-25T14:00:00Z",
            duration_minutes: 150,
            amount: 300.0,
            status: "stopped",
            is_invoiced: 0,
            invoice_id: null,
            invoice_no: "",
          },
        ],
      },
    ];

    return {
      status: 200,
      data: {
        success: true,
        data: timeTasks,
        pagination: {
          totalRecords: timeTasks.length,
          totalPages: 1,
          currentPage: 1,
        },
      },
    };
  }

  if (path === "/time-tracking/stats/time-based") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          summary: {
            total_hours: 42.5,
            billable_hours: 38.0,
            non_billable_hours: 4.5,
            total_amount: 4420.0,
            billable_amount: 4180.0,
            non_billable_amount: 240.0,
          },
          period: {
            start_date: "2026-10-01",
            end_date: "2026-10-31",
          },
          daily_breakdown: [
            { date: "2026-10-24", billable_hours: 4.0, non_billable_hours: 0, billable_amount: 440, non_billable_amount: 0 },
            { date: "2026-10-25", billable_hours: 2.5, non_billable_hours: 0, billable_amount: 300, non_billable_amount: 0 },
            { date: "2026-10-26", billable_hours: 4.0, non_billable_hours: 1.0, billable_amount: 380, non_billable_amount: 0 },
            { date: "2026-10-27", billable_hours: 4.0, non_billable_hours: 0.5, billable_amount: 440, non_billable_amount: 0 },
            { date: "2026-10-28", billable_hours: 4.0, non_billable_hours: 0, billable_amount: 440, non_billable_amount: 0 },
            { date: "2026-10-29", billable_hours: 7.5, non_billable_hours: 1.0, billable_amount: 825, non_billable_amount: 0 },
          ],
        },
      },
    };
  }

  if (path === "/time-tracking/stats/client-project") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          breakdown: [
            { id: "101", name: "Bayside Fitness", total_hours: 18.5, billable_hours: 18.5 },
            { id: "102", name: "Palm Grove Body Corporate", total_hours: 12.0, billable_hours: 12.0 },
            { id: "103", name: "Grace Holloway", total_hours: 5.5, billable_hours: 5.5 },
            { id: "104", name: "Apex Logistics", total_hours: 6.5, billable_hours: 6.5 },
          ],
        },
      },
    };
  }

  if (path === "/time-tracking/weekly") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          logs: [
            {
              id: "wl-1",
              task_id: "1",
              task_name: "Switchboard Upgrade & Sub-main Cabling",
              project_id: "1",
              project_name: "Switchboard Upgrade",
              client_id: "101",
              client_name: "Bayside Fitness",
              contact_id: "101",
              rate: 110,
              is_billable: 1,
              charge_type: "hourly",
              log_date: "2026-10-26",
              hours_logged: 4.0,
            },
            {
              id: "wl-2",
              task_id: "1",
              task_name: "Switchboard Upgrade & Sub-main Cabling",
              project_id: "1",
              project_name: "Switchboard Upgrade",
              client_id: "101",
              client_name: "Bayside Fitness",
              contact_id: "101",
              rate: 110,
              is_billable: 1,
              charge_type: "hourly",
              log_date: "2026-10-27",
              hours_logged: 4.0,
            },
            {
              id: "wl-3",
              task_id: "2",
              task_name: "Emergency Light Periodic Testing & Discharge Test",
              project_id: "2",
              project_name: "Strata Compliance 2026",
              client_id: "102",
              client_name: "Palm Grove Body Corporate",
              contact_id: "102",
              rate: 95,
              is_billable: 1,
              charge_type: "hourly",
              log_date: "2026-10-28",
              hours_logged: 4.0,
            },
            {
              id: "wl-4",
              task_id: "3",
              task_name: "Smoke Alarm Interconnect & Compliance Audit",
              project_id: null,
              project_name: "",
              client_id: "103",
              client_name: "Grace Holloway",
              contact_id: "103",
              rate: 120,
              is_billable: 1,
              charge_type: "hourly",
              log_date: "2026-10-29",
              hours_logged: 2.5,
            },
          ],
        },
      },
    };
  }

  if (path === "/time-tracking/active") {
    return {
      status: 200,
      data: {
        success: true,
        data: null,
      },
    };
  }

  if (path === "/time-tracking") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: "tt-1",
            task_id: "t-1",
            project_id: "p-1",
            project_job_id: "job-1",
            log_date: "2026-10-31",
            start_time: "08:30:00",
            end_time: "12:00:00",
            duration_minutes: 210,
            hours_logged: 3.5,
            amount: 385.0,
            rate: 110.0,
            status: "completed",
            is_invoiced: false,
            notes: "Emergency lighting monthly discharge test and battery replacements",
            client_id: 102,
            client_name: "Palm Grove Body Corporate",
            taskDetail: { id: "t-1", title: "Palm Grove Strata - Emergency Light Test" },
            clientDetail: { id: 102, name: "Palm Grove Body Corporate" },
          },
          {
            id: "tt-2",
            task_id: "t-3",
            project_id: "p-2",
            project_job_id: "job-2",
            log_date: "2026-10-30",
            start_time: "09:00:00",
            end_time: "13:30:00",
            duration_minutes: 270,
            hours_logged: 4.5,
            amount: 540.0,
            rate: 120.0,
            status: "completed",
            is_invoiced: true,
            invoice_id: "1",
            notes: "Switchboard rewiring, circuit isolation, and RCD testing",
            client_id: 101,
            client_name: "Bayside Fitness",
            taskDetail: { id: "t-3", title: "Bayside Fitness - Switchboard Commissioning" },
            clientDetail: { id: 101, name: "Bayside Fitness" },
          },
        ],
      },
    };
  }

  if (path.startsWith("/tasks/by-client")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          projects: seed.projects,
          jobs: [],
        },
      },
    };
  }

  if (path.startsWith("/tasks/client/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: [],
      },
    };
  }

  // Business Planning / Budgets / Goals / Wallet
  if (path === "/budget/stats" || path === "/v2/budget/stats") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          { month: "Aug", budget: 8500, spent: 6070 },
          { month: "Sep", budget: 8500, spent: 5900 },
          { month: "Oct", budget: 8500, spent: 6070 },
        ],
      },
    };
  }

  if (path === "/budget" || path === "/budget/list" || path === "/v2/budget") {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.budgets,
      },
    };
  }

  if (path.startsWith("/budget/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.budgets[0],
      },
    };
  }

  if (path === "/planner-goal" || path === "/v2/planner/goals" || path.startsWith("/planner-goal/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.goals,
      },
    };
  }

  if (path === "/expense-plan" || path === "/v2/expense-plans" || path.startsWith("/expense-plan/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.expensePlans,
      },
    };
  }

  if (path === "/goal-funding/cash-wallet" || path === "/v2/cash-wallet") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          opening_balance: seed.cashWallet.opening_balance || 1000,
          currency: seed.cashWallet.currency || "AUD",
          balance: seed.cashWallet.balance || 1450,
          movements: seed.cashWallet.movements || [],
        },
      },
    };
  }

  if (path === "/goal-funding/cash-wallet/history" || path === "/v2/cash-wallet/history") {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.cashWallet.movements || [],
      },
    };
  }

  if (path === "/goal-funding/summary" || path === "/v2/planner/funding-summary") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          total_cash: 19900.25,
          total_goals: seed.goals.length,
          total_budgets: seed.budgets.length,
          total_plans: seed.expensePlans.length,
        },
      },
    };
  }

  if (path === "/planner-overview" || path === "/v2/planner/overview") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          cash_on_hand: 19900.25,
          total_allocated_to_goals: 29500,
          committed_to_plans: 60500,
          funding_gap: 16000,
          net_planned_return: 24500,
        },
      },
    };
  }

  if (path === "/goal/tracker") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          income_goal: 240000,
          current_revenue: seed.dashboard.totalRevenue,
        },
      },
    };
  }

  // Investment Property Endpoints
  if (path === "/investment-property/portfolio/summary") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          total_properties: 2,
          active_properties: 2,
          disposed_properties: 0,
          total_current_value: "1590000.00",
          total_loan_amount: "980000.00",
          total_equity: "610000.00",
          ytd_rental_income_received: "42500.00",
          ytd_property_expenses: "8900.00",
          ytd_net_rental_result: "33600.00",
          ytd_loan_repayments: "24200.00",
          estimated_cash_flow_ytd: "9400.00",
          total_cost_base: "1395000.00",
        },
      },
    };
  }

  if (path === "/investment-property/dashboard/expense-breakdown") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          totals: { total: "8900.00" },
          breakdown: [
            { key: "property_expenses", label: "Property Expenses", amount: "6400.00" },
            { key: "capital_improvements", label: "Capital Improvements", amount: "2500.00" },
            { key: "selling_costs", label: "Selling Costs", amount: "0.00" },
          ],
          properties_in_scope: 2,
        },
      },
    };
  }

  if (path === "/investment-property/dashboard/income-expense") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          totals: {
            rental_income: "42500.00",
            property_expenses: "8900.00",
            net_result: "33600.00",
          },
        },
      },
    };
  }

  if (path === "/investment-property/dashboard/rent-collection") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          totals: {
            received_rent: "42500.00",
            outstanding_rent: "0.00",
            overdue_rent: "0.00",
            upcoming_rent: "2820.00",
            total_scheduled_rent: "45320.00",
            collection_rate: "98.50",
          },
        },
      },
    };
  }

  if (path === "/investment-property/dashboard/key-actions") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          properties_in_scope: 2,
          actions: [
            {
              key: "property_value_review_due",
              label: "Annual valuation review",
              description: "Broadbeach house valuation review due for annual indexation",
              count: 1,
            },
          ],
        },
      },
    };
  }

  if (path === "/investment-property/dashboard/capital-snapshot") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          properties_in_scope: 2,
          metrics: {
            total_cost_base: "1395000.00",
            capital_improvements: "2500.00",
            selling_costs: "0.00",
            disposal_sale_proceeds: "0.00",
            disposed_properties: 0,
          },
        },
      },
    };
  }

  if (path === "/investment-property/dashboard/property-comparison") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          properties_in_scope: 2,
          rows: [
            {
              property_id: 1,
              property_name: "42 Sunshine Parade",
              purchase_date: "2023-04-12",
              status: "active",
              current_value: "1050000.00",
              loan_balance: "620000.00",
              equity: "430000.00",
              rental_income: "27200.00",
              property_expenses: "5400.00",
              net_rental_result: "21800.00",
              cost_base: "884600.00",
            },
            {
              property_id: 2,
              property_name: "Unit 6 / 18 Marine Terrace",
              purchase_date: "2024-01-15",
              status: "active",
              current_value: "540000.00",
              loan_balance: "360000.00",
              equity: "180000.00",
              rental_income: "15300.00",
              property_expenses: "3500.00",
              net_rental_result: "11800.00",
              cost_base: "498600.00",
            },
          ],
        },
      },
    };
  }

  if (path.startsWith("/investment-property/summary/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          costBase: "884600.00",
          capitalImprovements: "15000.00",
          ytdRentalIncome: 27200,
          ytdExpenses: 5400,
          ytdNetReturn: 21800,
        },
      },
    };
  }

  if (path.startsWith("/investment-property/loan/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          loan: {
            id: 1,
            property_id: 1,
            lender_name: "Macquarie Bank",
            loan_account_number: "••••4821",
            initial_loan_amount: 680000,
            current_balance: 620000,
            interest_rate: 5.94,
            loan_type: "principal_and_interest",
            monthly_repayment: 3680,
          },
        },
      },
    };
  }

  if (path.startsWith("/investment-property/expenses/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: 1,
            property_id: 1,
            expense_date: "2026-09-15",
            amount: "1450.00",
            category: "Council Rates",
            description: "City of Gold Coast - Q1 Council rates",
            supplier: "City of Gold Coast",
          },
          {
            id: 2,
            property_id: 1,
            expense_date: "2026-10-01",
            amount: "980.00",
            category: "Insurance",
            description: "Landlord building & contents insurance",
            supplier: "Terri Scheer",
          },
        ],
        total_amount: "2430.00",
      },
    };
  }

  if (path.startsWith("/investment-property/income/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: 1,
            property_id: 1,
            payment_date: "2026-10-01",
            amount: "3683.33",
            period_start: "2026-10-01",
            period_end: "2026-10-31",
            tenant_name: "Ray White Broadbeach (Trust Acct)",
            description: "Monthly net rental remittance",
          },
        ],
        total_amount: "3683.33",
      },
    };
  }

  if (path.startsWith("/investment-property/rental-schedule")) {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: 1,
            property_id: 1,
            lease_start: "2024-02-01",
            lease_end: "2027-01-31",
            weekly_rent: 850,
            payment_frequency: "monthly",
            tenant_name: "Michael & Sarah Davies",
            managing_agent: "Ray White Broadbeach",
            status: "active",
          },
        ],
      },
    };
  }

  if (path.startsWith("/investment-property/maintenance/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: 1,
            property_id: 1,
            title: "Ducted air-conditioning 12-month service",
            status: "completed",
            reported_date: "2026-08-10",
            resolved_date: "2026-08-14",
            cost: 350.0,
            contractor: "CoolBreeze Air",
          },
        ],
      },
    };
  }

  if (path.startsWith("/investment-property/documents/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: 1,
            property_id: 1,
            name: "Tenancy Agreement - 42 Sunshine Pde.pdf",
            document_type: "lease",
            uploaded_at: "2024-02-01",
            size_bytes: 2450000,
          },
          {
            id: 2,
            property_id: 1,
            name: "Tax Depreciation Schedule - BMT QRS.pdf",
            document_type: "depreciation",
            uploaded_at: "2023-05-10",
            size_bytes: 4120000,
          },
        ],
      },
    };
  }

  if (path.startsWith("/investment-property/cost-base/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          cost_base: "884600.00",
          capital_improvements: "15000.00",
          holding_costs: "0.00",
          adjustments: [],
        },
      },
    };
  }

  if (path.startsWith("/investment-property/cgt-breakdown/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          cost_base: "884600.00",
          current_market_value: "1050000.00",
          unrealised_gross_gain: "165400.00",
          cgt_discount_eligible: true,
          discounted_capital_gain: "82700.00",
        },
      },
    };
  }

  if (path.startsWith("/investment-property/cgt-tax-impact/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          unrealised_gain: "165400.00",
          taxable_capital_gain: "82700.00",
          estimated_tax_payable: "28531.50",
          marginal_tax_rate: "34.5%",
        },
      },
    };
  }

  if (path === "/investment-property" || path === "/investment-property/list") {
    const investmentProperties = [
      {
        id: 1,
        property_name: "42 Sunshine Parade",
        address: "42 Sunshine Parade, Broadbeach QLD 4218",
        property_type: "house",
        ownership_entity: "individual",
        property_tax_treatment: "standard_investment",
        purchase_date: "2023-04-12",
        purchase_price: "850000.00",
        stamp_duty: "32400.00",
        legal_costs: "2200.00",
        buyer_agent_costs: "0.00",
        current_value: "1050000.00",
        status: "active",
        notes: "4-bedroom coastal investment property, 600m from beach. Fully leased through Ray White Broadbeach.",
      },
      {
        id: 2,
        property_name: "Unit 6 / 18 Marine Terrace",
        address: "Unit 6 / 18 Marine Terrace, Southport QLD 4215",
        property_type: "unit",
        ownership_entity: "individual",
        property_tax_treatment: "standard_investment",
        purchase_date: "2024-01-15",
        purchase_price: "480000.00",
        stamp_duty: "16800.00",
        legal_costs: "1800.00",
        buyer_agent_costs: "0.00",
        current_value: "540000.00",
        status: "active",
        notes: "2-bedroom residential apartment with ocean views. Strata $1,100/quarter.",
      },
    ];

    return {
      status: 200,
      data: {
        success: true,
        data: investmentProperties,
        pagination: { total: investmentProperties.length, total_pages: 1 },
      },
    };
  }

  if (path.startsWith("/investment-property/")) {
    const id = path.replace("/investment-property/", "");
    return {
      status: 200,
      data: {
        success: true,
        data: {
          id: Number(id) || 1,
          property_name: id === "2" ? "Unit 6 / 18 Marine Terrace" : "42 Sunshine Parade",
          address: id === "2" ? "Unit 6 / 18 Marine Terrace, Southport QLD 4215" : "42 Sunshine Parade, Broadbeach QLD 4218",
          property_type: id === "2" ? "unit" : "house",
          ownership_entity: "individual",
          property_tax_treatment: "standard_investment",
          purchase_date: id === "2" ? "2024-01-15" : "2023-04-12",
          purchase_price: id === "2" ? "480000.00" : "850000.00",
          stamp_duty: id === "2" ? "16800.00" : "32400.00",
          legal_costs: id === "2" ? "1800.00" : "2200.00",
          buyer_agent_costs: "0.00",
          current_value: id === "2" ? "540000.00" : "1050000.00",
          status: "active",
          notes: id === "2" ? "2-bedroom apartment with ocean views." : "4-bedroom coastal investment property.",
        },
      },
    };
  }

  // Assets Depreciation & Report Packs
  if (path === "/assets/depreciation/summary" || path === "/asset/depreciation/summary") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          total_depreciation: 4850.0,
          asset_count: 4,
          assets: [
            {
              asset_id: "1",
              asset_name: "2022 Toyota HiAce LWB Service Van",
              purchase_date: "2024-03-12",
              cost: 48000.0,
              method: "diminishing_value",
              rate: 25.0,
              opening_value: 36000.0,
              fy_depreciation: 3600.0,
              book_value: 32400.0,
            },
            {
              asset_id: "2",
              asset_name: "Milwaukee M18 Fuel 6-Piece Power Tool Kit",
              purchase_date: "2024-05-20",
              cost: 2500.0,
              method: "prime_cost",
              rate: 20.0,
              opening_value: 2000.0,
              fy_depreciation: 500.0,
              book_value: 1500.0,
            },
            {
              asset_id: "3",
              asset_name: "Fluke 1664 FC Multifunction Tester",
              purchase_date: "2024-07-15",
              cost: 3500.0,
              method: "prime_cost",
              rate: 20.0,
              opening_value: 3500.0,
              fy_depreciation: 450.0,
              book_value: 3050.0,
            },
            {
              asset_id: "4",
              asset_name: "Apple iPad Pro 11-inch M2 Tablet",
              purchase_date: "2024-11-10",
              cost: 1500.0,
              method: "prime_cost",
              rate: 33.3,
              opening_value: 1500.0,
              fy_depreciation: 300.0,
              book_value: 1200.0,
            },
          ],
        },
      },
    };
  }

  if (path.startsWith("/report/account")) {
    const subcategoryId = Number(path.replace("/report/account/", "").replace("/report/account", "")) || 1;
    return {
      status: 200,
      data: {
        success: true,
        data: {
          account: {
            subcategory_id: subcategoryId,
            code: "400",
            name: "Electrical Contracting Services",
            category: "Revenue",
          },
          gst_treatment: {
            source: "Sole Ledger",
            entries: 48,
            with_gst: 48,
            without_gst: 0,
            gst_percentage: 10,
            label: "GST on Income (10%)",
          },
          activity: {
            net_amount: 54200.0,
            first_posted: "2026-07-01",
            last_posted: "2026-10-28",
          },
        },
      },
    };
  }

  if (path === "/v2/report-packs/catalogue") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          available_reports: [
            { id: "profit-loss", name: "Profit & Loss", category: "Financial Statements" },
            { id: "balance-sheet", name: "Balance Sheet", category: "Financial Statements" },
            { id: "cash-flow", name: "Cash Flows", category: "Financial Statements" },
            { id: "trial-balance", name: "Trial Balance", category: "Accountant Reports" },
            { id: "bas", name: "BAS / GST Summary", category: "Tax Compliance" },
            { id: "asset-listing", name: "Asset Listing", category: "Asset Reports" },
            { id: "transaction-listing", name: "Transaction Listing", category: "Accountant Reports" },
          ],
        },
      },
    };
  }

  if (path === "/v2/report-packs/templates") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: "tpl-1",
            name: "Standard Quarterly Pack",
            description: "Profit & Loss, Balance Sheet, and BAS review for quarterly compliance.",
            reports: ["profit-loss", "balance-sheet", "bas"],
            is_default: true,
          },
          {
            id: "tpl-2",
            name: "Annual Accountant Tax Pack",
            description: "Full financial year package for external tax agent lodgement.",
            reports: ["profit-loss", "balance-sheet", "trial-balance", "asset-listing", "transaction-listing"],
            is_default: false,
          },
        ],
      },
    };
  }

  if (path === "/v2/report-packs") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: "pack-1",
            name: "Q1 FY27 Business & Tax Review Pack",
            status: "ready",
            period: "Q1 FY27",
            created_at: "2026-10-15T09:00:00Z",
            reports_count: 3,
            download_url: "#",
          },
        ],
        pagination: { total: 1, total_pages: 1 },
      },
    };
  }

  // Bank Accounts
  if (
    path === "/bank/accounts" ||
    path === "/bank/account" ||
    path === "/v2/bank/accounts" ||
    path === "/v2/bank/account"
  ) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          success: true,
          total_balance: 42850.5,
          accounts: [
            {
              id: "1",
              bank_connection_id: "conn-1",
              bank_name: "Coastal Community Bank",
              account_name: "Everyday Business Account",
              account_number: "10492831",
              bsb: "484-799",
              account_type: "TRANS_AND_SAVINGS_ACCOUNTS",
              balance: 34120.5,
              available: 34120.5,
              currency: "AUD",
              provider: "fiskil",
              status: "connected",
              last_synced_at: new Date(Date.now() - 3600000).toISOString(),
            },
            {
              id: "2",
              bank_connection_id: "conn-2",
              bank_name: "Coastal Community Bank",
              account_name: "Business Online Saver",
              account_number: "10492842",
              bsb: "484-799",
              account_type: "TRANS_AND_SAVINGS_ACCOUNTS",
              balance: 8730.0,
              available: 8730.0,
              currency: "AUD",
              provider: "fiskil",
              status: "connected",
              last_synced_at: new Date(Date.now() - 3600000).toISOString(),
            },
          ],
        },
      },
    };
  }

  if (
    path === "/bank/refresh" ||
    path === "/bank/single/refresh" ||
    path === "/bank/count/refresh" ||
    path === "/bank/single/refresh/historical"
  ) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          count: 5,
          status: "success",
        },
      },
    };
  }

  if (path === "/dashboard/bank/accounts/balance") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: "1",
            bank_name: "Coastal Community Bank",
            account_name: "Everyday Business Account",
            balance: 34120.5,
            account_number: "•••• 2831",
          },
          {
            id: "2",
            bank_name: "Coastal Community Bank",
            account_name: "Business Online Saver",
            balance: 8730.0,
            account_number: "•••• 2842",
          },
        ],
      },
    };
  }

  if (path.startsWith("/bank/accounts/") && path.includes("historical-status")) {
    return {
      status: 200,
      data: {
        success: true,
        data: { status: "ready", can_import: false },
      },
    };
  }

  // Matching Rules
  if (path === "/v2/matching-rules" || path === "/matching-rules") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          rules: seed.matchingRules,
        },
      },
    };
  }

  if (path === "/v2/transactions-auto-match-count") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          count: seed.matchingRules.length,
          auto_match_count: 24,
          matched: 18,
          unmatched: 6,
          total: 24,
          matched_details: [
            {
              id: "1",
              transaction_id: "5001",
              description: "Direct Deposit INV-1045",
              type: "credit",
              amount: 2420.0,
              client_name: "Palm Grove Body Corporate",
              category_name: "Sales income",
            },
            {
              id: "2",
              transaction_id: "5002",
              description: "Direct Debit Middy's Electrical Supplies",
              type: "debit",
              amount: 1420.0,
              client_name: "Middy's Electrical",
              category_name: "Materials & Supplies",
            },
            {
              id: "3",
              transaction_id: "5003",
              description: "Bunnings Warehouse Southport",
              type: "debit",
              amount: 284.6,
              client_name: "Bunnings Warehouse",
              category_name: "Consumables & Hardware",
            },
            {
              id: "4",
              transaction_id: "5004",
              description: "Direct Deposit INV-1042 Bayside Fitness",
              type: "credit",
              amount: 1850.0,
              client_name: "Bayside Fitness",
              category_name: "Sales income",
            },
          ],
        },
      },
    };
  }

  // Bills & Bill Schedules
  if (path === "/v2/bill/summary") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          as_of: new Date().toISOString().slice(0, 10),
          paid_this_month: { amount: 2150.0, count: 1 },
          overdue: { amount: 890.5, count: 1, expected_count: 0 },
          due_7_days: { amount: 1420.0, count: 1, expected_count: 0 },
          due_30_days: { amount: 1812.0, count: 4, expected_count: 2 },
          owed: { amount: 2702.5, count: 5, expected_count: 2 },
        },
      },
    };
  }

  if (path === "/v2/bill/upcoming") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          as_of: new Date().toISOString().slice(0, 10),
          bills: seed.bills.filter((b) => b.status === "unpaid" || b.status === "overdue"),
          expected: [
            {
              expected_id: "exp_1",
              schedule_id: "1",
              supplier_name: "Telstra",
              amount: 89.0,
              expected_date: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
              frequency: "monthly",
            },
            {
              expected_id: "exp_2",
              schedule_id: "2",
              supplier_name: "Tradie Insurance Co",
              amount: 245.0,
              expected_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
              frequency: "monthly",
            },
          ],
        },
      },
    };
  }

  if (path === "/v2/bill/calendar") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          bills: seed.bills,
          expected: [],
        },
      },
    };
  }

  if (path.startsWith("/v2/bill/schedules/")) {
    const id = path.replace("/v2/bill/schedules/", "");
    const sched = seed.billSchedules.find((s) => s.schedule_id === id) || seed.billSchedules[0];
    return {
      status: 200,
      data: { success: true, data: sched },
    };
  }

  if (path === "/v2/bill" || path === "/v2/bill/list") {
    const status = params.status;
    let list = seed.bills;
    if (status && status !== "all") {
      list = list.filter((b) => b.status === status);
    }
    return {
      status: 200,
      data: {
        success: true,
        data: {
          bills: list,
          pagination: { total: list.length },
        },
      },
    };
  }

  if (
    path.startsWith("/v2/bill/") &&
    !path.includes("/summary") &&
    !path.includes("/upcoming") &&
    !path.includes("/calendar") &&
    !path.includes("/schedules")
  ) {
    const id = path.replace("/v2/bill/", "");
    const bill = seed.bills.find((b) => b.bill_id === id) || seed.bills[0];
    return {
      status: 200,
      data: { success: true, data: bill },
    };
  }

  // Proposals & Proposal Templates
  if (path === "/proposal/templates") {
    const type = params.template_type;
    const list = type
      ? seed.proposalTemplates.filter((t) => t.template_type === type)
      : seed.proposalTemplates;
    return {
      status: 200,
      data: {
        success: true,
        data: list,
      },
    };
  }

  if (path.startsWith("/proposal/templates/")) {
    const id = path.replace("/proposal/templates/", "");
    const item = seed.proposalTemplates.find((t) => t.id === id) || seed.proposalTemplates[0];
    return {
      status: 200,
      data: { success: true, data: item },
    };
  }

  if (path.startsWith("/proposal/") && path.endsWith("/comments")) {
    return {
      status: 200,
      data: { success: true, data: [] },
    };
  }

  if (path === "/proposal" || path === "/proposal/list" || path === "/v2/proposal") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          rows: seed.proposals,
          pagination: { total: seed.proposals.length },
        },
      },
    };
  }

  if (path.startsWith("/proposal/") && !path.includes("/templates") && !path.includes("/comments")) {
    const id = path.replace("/proposal/", "");
    const prop = seed.proposals.find((p) => p.id === id) || seed.proposals[0];
    return {
      status: 200,
      data: { success: true, data: prop },
    };
  }

  // Credit Notes / Refunds (Client refunds & Vendor refunds)
  if (path === "/credit-note" || path === "/credit-note/list" || path === "/v2/credit-note") {
    const isVendor = params.type === "vendor";
    const isClient = params.type === "client";
    const notes = isVendor
      ? seed.creditNotes.filter((cn: any) => cn.type === "vendor")
      : isClient
      ? seed.creditNotes.filter((cn: any) => cn.type === "client")
      : seed.creditNotes;

    const notesArr = [...notes];
    (notesArr as any).credit_notes = notesArr;

    return {
      status: 200,
      data: {
        success: true,
        data: notesArr,
        pagination: {
          total: notes.length,
          totalPages: 1,
        },
      },
    };
  }

  if (path.startsWith("/credit-note/") || path.startsWith("/v2/credit-note/")) {
    const id = path.replace("/v2/credit-note/", "").replace("/credit-note/", "");
    const note = seed.creditNotes.find((cn: any) => String(cn.id) === id || String(cn.credit_note_id) === id) || seed.creditNotes[0];
    return {
      status: 200,
      data: {
        success: true,
        data: note,
      },
    };
  }

  // Merchant & Payments (SolePay / NextTap)
  if (path === "/v1/worldpay/account/status") {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.merchantAccounts.worldpay,
      },
    };
  }

  if (path === "/v1/worldpay/payment/settlements") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          settlements: seed.merchantAccounts.worldpay.settlements,
          total: seed.merchantAccounts.worldpay.settlements.length,
        },
      },
    };
  }

  if (path === "/v2/nexxtap/account/status") {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.merchantAccounts.nexxtap,
      },
    };
  }

  // Unibox endpoints (Quick Actions & Today Deck)
  if (path.startsWith("/unibox/")) {
    const sub = path.replace("/unibox/", "");
    if (sub === "onboarding" || sub === "onboarding/skip") {
      return { status: 200, data: { success: true, data: { completed: true, skipped: true } } };
    }
    if (sub === "priorities") {
      return { status: 200, data: { success: true, data: [] } };
    }
    if (sub === "invoices") {
      return {
        status: 200,
        data: {
          success: true,
          data: seed.invoices.filter((i) => i.status === "due" || i.status === "overdue").slice(0, 6),
        },
      };
    }
    if (sub === "quotes") {
      return {
        status: 200,
        data: {
          success: true,
          data: seed.quotes.filter((q) => q.status === "open").slice(0, 6),
        },
      };
    }
    if (sub === "expenses") {
      return {
        status: 200,
        data: {
          success: true,
          data: seed.expenses.filter((e) => e.is_reconciled === 0).slice(0, 6),
        },
      };
    }
    if (sub === "assets") {
      return { status: 200, data: { success: true, data: seed.assets.slice(0, 3) } };
    }
    if (sub === "liabilities" || sub === "equity") {
      return { status: 200, data: { success: true, data: [] } };
    }
    if (sub === "time-tracker") {
      return {
        status: 200,
        data: {
          success: true,
          data: [
            {
              id: "1",
              task_name: "Switchboard Upgrade Wiring",
              hours: "3.5",
              client_name: "Bayside Fitness",
              date: new Date().toISOString().slice(0, 10),
            },
          ],
        },
      };
    }
    if (sub === "projects") {
      return { status: 200, data: { success: true, data: seed.projects } };
    }
    if (sub === "km-tracker") {
      return { status: 200, data: { success: true, data: seed.kmTrips.slice(0, 6) } };
    }
    if (sub === "work-coming-up") {
      return { status: 200, data: { success: true, data: seed.calendarEvents.slice(0, 6) } };
    }
    if (sub === "bank-transactions") {
      return { status: 200, data: { success: true, data: seed.bankTransactions.slice(0, 6) } };
    }
    if (sub === "inventory") {
      return {
        status: 200,
        data: {
          success: true,
          data: seed.customProducts.filter((p: any) => p.inventory_flag === 1).slice(0, 6),
        },
      };
    }
    if (sub === "progress") {
      return {
        status: 200,
        data: {
          success: true,
          data: {
            days_streak: 14,
            completed_tasks: 48,
            pending_tasks: 6,
          },
        },
      };
    }
    return { status: 200, data: { success: true, data: [] } };
  }

  // Superannuation KPI Matrix & Contributions
  if (
    path === "/v2/super-contribution/matrix" ||
    path.endsWith("/super-contribution/matrix") ||
    path.endsWith("/matrix")
  ) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          has_previous_data: true,
          cards_data: [
            { key: "total_contributions", total_amount: 11500, percentage_change: 8.5 },
            { key: "matched_contributions", total_amount: 9200, percentage_change: 10.2 },
            { key: "pending_contributions", total_amount: 2300, percentage_change: -4.1 },
          ],
        },
      },
    };
  }

  if (path === "/fund" || path === "/funds") {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.superFunds,
      },
    };
  }

  if (path === "/v2/super-contribution" || path === "/super-contribution") {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit || params.page_size) || 25;
    const start = (page - 1) * limit;

    return {
      status: 200,
      data: {
        success: true,
        data: seed.superContributions.slice(start, start + limit),
        pagination: {
          total: seed.superContributions.length,
        },
      },
    };
  }

  if (path.startsWith("/v2/super-contribution/")) {
    const id = path.replace("/v2/super-contribution/", "");
    const item = seed.superContributions.find((s) => s.id === id) || seed.superContributions[0];
    const [year, month, day] = item.date.split("-");
    return {
      status: 200,
      data: {
        success: true,
        data: {
          id: item.id,
          fund: { id: item.fund_id, name: item.fund_name },
          date: `${day}-${month}-${year}`,
          price: item.price,
          notes: item.description,
          is_taxable: item.is_taxable,
          remaining_amount: item.remaining_amount,
        },
      },
    };
  }

  // Payroll & Microkeeper
  if (path === "/microkeeper/connection" || path === "/microkeeper/verify" || path === "/microkeeper/connect") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          connected: true,
          status: "CONNECTED",
          microkeeper_business_name: "Coastal Spark Electrical",
          last_verified_at: "2026-11-01T10:00:00Z",
          last_sync_at: "2026-11-04T08:00:00Z",
          last_error: null,
        },
      },
    };
  }

  if (path === "/payroll/subscription" || path === "/payroll/subscription/invoices") {
    if (path === "/payroll/subscription/invoices") {
      return { status: 200, data: { success: true, data: [] } };
    }
    return {
      status: 200,
      data: {
        success: true,
        data: {
          status: "ACTIVE",
          isActive: true,
          isFrozen: false,
          pricePerEmployee: 4.99,
          billingInterval: "MONTHLY",
          employeeLimit: 5,
          activeEmployees: 2,
          availableSeats: 3,
          canAddEmployee: true,
          monthlyCost: 24.95,
          annualCost: 299.4,
          currentPeriodEnd: "2026-12-01T00:00:00Z",
          gracePeriodEnd: null,
        },
      },
    };
  }

  if (path === "/payroll/subscription/add-seats") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          status: "ACTIVE",
          isActive: true,
          isFrozen: false,
          pricePerEmployee: 4.99,
          billingInterval: "MONTHLY",
          employeeLimit: 7,
          activeEmployees: 2,
          availableSeats: 5,
          canAddEmployee: true,
          monthlyCost: 34.93,
          annualCost: 419.16,
          currentPeriodEnd: "2026-12-01T00:00:00Z",
          gracePeriodEnd: null,
        },
      },
    };
  }

  if (path === "/payroll/subscription/reduce-seats") {
    return { status: 200, data: { success: true, message: "Seats adjusted" } };
  }

  if (path === "/payroll/overview") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          business: {
            name: "Coastal Spark Electrical Pty Ltd",
          },
          connection: {
            connected: true,
            status: "CONNECTED",
            microkeeper_business_name: "Coastal Spark Electrical",
            last_verified_at: "2026-11-01T10:00:00Z",
            last_sync_at: "2026-11-04T08:00:00Z",
            last_error: null,
          },
          stats: {
            total_employees: 2,
            active_employees: 2,
            profile_incomplete: 0,
            full_time: 1,
            part_time: 1,
            casual: 0,
            sub_contractor: 0,
            sub_contractor_with_super: 0,
            synced: 2,
            pending_sync: 0,
            failed_sync: 0,
            total_payruns: seed.payruns.length,
            completed_payruns: seed.payruns.length,
            total_payment_amount: 11362.0,
          },
          latest_payrun: {
            id: seed.payruns[0]?.id || "14",
            mk_run_id: seed.payruns[0]?.payrun_id || "14",
            mk_year: "2026",
            status: "COMPLETED",
            period: "fortnightly",
            start_date: seed.payruns[0]?.period_start || "2026-10-15",
            end_date: seed.payruns[0]?.period_end || "2026-10-28",
            payment_date: seed.payruns[0]?.pay_date || "2026-10-29",
            payment_total: seed.payruns[0]?.total_net || 2033.85,
            expense_total: seed.payruns[0]?.total_gross || 2840.5,
            deduction_total: seed.payruns[0]?.total_tax || 480.0,
          },
        },
      },
    };
  }

  // Employees
  if (path === "/employees") {
    const list = [
      {
        id: "1",
        given_name: "Jake",
        surname: "Morrison",
        username: "jake.morrison",
        eusername: "jake_morrison",
        email: "jake.morrison@coastalspark.example.com",
        mobile_country_code: "+61",
        mobile_number: "0412 345 678",
        employment_type: "FULL_TIME",
        payroll_id: "EMP-001",
        status: "SYNCED",
        profile_photo_url: null,
      },
      {
        id: "2",
        given_name: "Olivia",
        surname: "Grant",
        username: "olivia.grant",
        eusername: "olivia_grant",
        email: "olivia.grant@coastalspark.example.com",
        mobile_country_code: "+61",
        mobile_number: "0423 456 789",
        employment_type: "PART_TIME",
        payroll_id: "EMP-002",
        status: "SYNCED",
        profile_photo_url: null,
      },
    ];
    return {
      status: 200,
      data: {
        success: true,
        data: list,
        pagination: {
          total: list.length,
          total_pages: 1,
          totalPages: 1,
          page: 1,
          limit: 10,
        },
      },
    };
  }

  if (path === "/employees/stats") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          total_employees: 2,
          active_employees: 2,
          profile_incomplete: 0,
          failed_sync: 0,
        },
      },
    };
  }

  if (path === "/employees/bulk/template") {
    return {
      status: 200,
      data: "Given Name,Surname,Email,Mobile Number,Employment Type,Start Date\nJake,Morrison,jake@example.com,0412345678,FULL_TIME,2024-02-15\nOlivia,Grant,olivia@example.com,0423456789,PART_TIME,2024-06-01\n",
    };
  }

  if (path.startsWith("/employees/") && path.endsWith("/completeness")) {
    const id = path.replace("/employees/", "").replace("/completeness", "");
    return {
      status: 200,
      data: {
        success: true,
        data: {
          employeeId: id,
          employeeName: id === "2" ? "Olivia Grant" : "Jake Morrison",
          isComplete: true,
          totalMissingFields: 0,
          missing: {},
        },
      },
    };
  }

  if (path.startsWith("/employees/") && path.endsWith("/documents")) {
    return {
      status: 200,
      data: {
        success: true,
        data: [],
      },
    };
  }

  if (path.startsWith("/employees/")) {
    const id = path.replace("/employees/", "");
    const isOlivia = id === "2";
    return {
      status: 200,
      data: {
        success: true,
        data: {
          id,
          given_name: isOlivia ? "Olivia" : "Jake",
          surname: isOlivia ? "Grant" : "Morrison",
          username: isOlivia ? "olivia.grant" : "jake.morrison",
          eusername: isOlivia ? "olivia_grant" : "jake_morrison",
          status: "SYNCED",
          personal_details: {
            first_name: isOlivia ? "Olivia" : "Jake",
            last_name: isOlivia ? "Grant" : "Morrison",
            email: isOlivia
              ? "olivia.grant@coastalspark.example.com"
              : "jake.morrison@coastalspark.example.com",
            phone: isOlivia ? "0423 456 789" : "0412 345 678",
            gender: isOlivia ? "FEMALE" : "MALE",
            dob: isOlivia ? "1994-09-22" : "2001-05-14",
            address_line_1: isOlivia ? "88 Marine Parade" : "12 Seaside Drive",
            suburb: isOlivia ? "Southport" : "Surfers Paradise",
            state: "QLD",
            postcode: isOlivia ? "4215" : "4217",
          },
          employment: {
            employment_type: isOlivia ? "PART_TIME" : "FULL_TIME",
            job_title: isOlivia
              ? "Office Admin & Bookkeeper"
              : "Apprentice Electrician",
            start_date: isOlivia ? "2024-06-01" : "2024-02-15",
            default_hourly_rate: isOlivia ? "34.00" : "24.50",
            hourly_rate: isOlivia ? "34.00" : "24.50",
            pay_period: "fortnightly",
            contracted_hours: isOlivia ? "15" : "38",
          },
          tax: {
            tax_file_number: isOlivia ? "876 543 210" : "987 654 321",
            tax_scale: "AUSTRALIAN_RESIDENT",
            claim_tax_free_threshold: true,
          },
          super: {
            employer_super_fund: isOlivia ? "Hostplus" : "AustralianSuper",
            employer_member_number: isOlivia ? "HP-338291" : "AS-9921482",
            super_fund_name: isOlivia ? "Hostplus" : "AustralianSuper",
            super_fund_abn: isOlivia ? "68 657 495 890" : "65 714 394 898",
            super_fund_usi: isOlivia ? "HP-001AU" : "STA0100AU",
            member_number: isOlivia ? "HP-338291" : "AS-9921482",
          },
          banking: {
            account_name: isOlivia ? "Olivia Grant" : "Jake Morrison",
            bsb: isOlivia ? "084-004" : "064-000",
            account_number: isOlivia ? "44928103" : "10928374",
          },
          access_control: {
            role: "Employee",
          },
        },
      },
    };
  }

  // Payruns
  if (path === "/payruns" || path === "/payruns/list") {
    const mappedRuns = seed.payruns.map((run) => ({
      id: run.id,
      mk_run_id: run.payrun_id || run.id,
      mk_year: "2026",
      period: "fortnightly",
      start_date: run.period_start,
      end_date: run.period_end,
      payment_date: run.pay_date,
      payment_total: run.total_net,
      expense_total: run.total_gross,
      deduction_total: run.total_tax,
      employeeCount: run.employees_count || 2,
      status: (run.status || "COMPLETED").toUpperCase(),
    }));
    return {
      status: 200,
      data: {
        success: true,
        data: mappedRuns,
        pagination: {
          total: mappedRuns.length,
          totalPages: 1,
        },
      },
    };
  }

  if (path === "/payruns/status-counts") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          all: seed.payruns.length,
          completed: seed.payruns.length,
          draft: 0,
          inProgress: 0,
          failed: 0,
        },
      },
    };
  }

  if (path.startsWith("/payruns/") && path.endsWith("/issues")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          total: 0,
          issues: [],
        },
      },
    };
  }

  if (path.startsWith("/payruns/") && path.endsWith("/detail")) {
    const runId = path.replace("/payruns/", "").replace("/detail", "");
    const run = seed.payruns.find((r) => r.id === runId) || seed.payruns[0];
    return {
      status: 200,
      data: {
        success: true,
        data: {
          status: "COMPLETED",
          period: "fortnightly",
          startDate: run?.period_start || "2026-10-15",
          endDate: run?.period_end || "2026-10-28",
          paymentDate: run?.pay_date || "2026-10-29",
          mkYear: "2026",
          mkRunId: run?.payrun_id || runId,
          summary: {
            totalGross: run?.total_gross || 2840.5,
            totalTax: run?.total_tax || 480.0,
            totalNet: run?.total_net || 2033.85,
            issueCount: 0,
          },
          payslips: [
            {
              id: "1",
              employeeId: "1",
              employeeName: "Jake Morrison",
              employmentType: "Full time",
              hours: 76,
              normalHours: 76,
              additionalHours: 0,
              gross: 1862.0,
              tax: 320.0,
              net: 1327.9,
              superAmount: 214.13,
              superFund: "AustralianSuper",
              superMemberNo: "AS-9921482",
              payItems: [
                {
                  note: "Ordinary Hours",
                  class: "Normal",
                  rate: 24.5,
                  hours: 76,
                  mult: 1,
                  value: 1862.0,
                },
              ],
              expenses: [],
              deductions: [],
              leaveAccrual: [
                { type: "al", balance: 114, accrual: 5.85 },
                { type: "sick", balance: 57, accrual: 2.92 },
              ],
              hasIssue: false,
              diffPercent: 0,
              mkSlipId: "SLIP-104-1",
            },
            {
              id: "2",
              employeeId: "2",
              employeeName: "Olivia Grant",
              employmentType: "Part time",
              hours: 30,
              normalHours: 30,
              additionalHours: 0,
              gross: 978.5,
              tax: 160.0,
              net: 705.95,
              superAmount: 112.52,
              superFund: "Hostplus",
              superMemberNo: "HP-338291",
              payItems: [
                {
                  note: "Office Admin Hours",
                  class: "Normal",
                  rate: 32.6167,
                  hours: 30,
                  mult: 1,
                  value: 978.5,
                },
              ],
              expenses: [],
              deductions: [],
              leaveAccrual: [
                { type: "al", balance: 45, accrual: 2.3 },
                { type: "sick", balance: 22, accrual: 1.15 },
              ],
              hasIssue: false,
              diffPercent: 0,
              mkSlipId: "SLIP-104-2",
            },
          ],
        },
      },
    };
  }

  // Leave Requests
  if (path === "/leave-requests") {
    const list = [
      {
        id: "1",
        employeeId: "1",
        employee_id: "1",
        employeeName: "Jake Morrison",
        employee_name: "Jake Morrison",
        employee: { id: "1", name: "Jake Morrison", eusername: "jake_morrison" },
        leaveType: "ANNUAL",
        leave_type: "ANNUAL",
        startDate: "2026-12-22",
        start_date: "2026-12-22",
        endDate: "2026-12-29",
        end_date: "2026-12-29",
        daysOff: 5,
        estimatedHours: 38,
        hours: 38,
        status: "APPROVED",
        comments: "Christmas break with family",
        notes: "Christmas break with family",
      },
    ];
    return {
      status: 200,
      data: {
        success: true,
        data: list,
        pagination: {
          total: list.length,
          total_pages: 1,
          totalPages: 1,
        },
      },
    };
  }

  if (path === "/leave-requests/counts") {
    return {
      status: 200,
      data: {
        success: true,
        data: { all: 1, pending: 0, approved: 1, declined: 0, cancelled: 0 },
      },
    };
  }

  // Payroll Reports
  if (path === "/reports/payroll-summary") {
    return {
      status: 200,
      data: {
        success: true,
        employees: [
          {
            employeeId: "1",
            employeeName: "Jake Morrison",
            employmentType: "Full time",
            hours: 380,
            costToBusiness: 10450.0,
            totalExpenses: 10450.0,
            grossTaxable: 9310.0,
            taxes: 1600.0,
            deductions: 0,
            net: 6639.5,
          },
          {
            employeeId: "2",
            employeeName: "Olivia Grant",
            employmentType: "Part time",
            hours: 150,
            costToBusiness: 5493.5,
            totalExpenses: 5493.5,
            grossTaxable: 4892.5,
            taxes: 800.0,
            deductions: 0,
            net: 3529.75,
          },
        ],
        totals: {
          hours: 530,
          costToBusiness: 15943.5,
          totalExpenses: 15943.5,
          grossTaxable: 14202.5,
          taxes: 2400.0,
          deductions: 0,
          net: 10169.25,
        },
        pagination: { total: 2, totalPages: 1 },
      },
    };
  }

  if (path === "/reports/payroll-breakdown") {
    return {
      status: 200,
      data: {
        success: true,
        employees: [
          {
            employeeId: "1",
            employeeName: "Jake Morrison",
            hours: 380,
            grossTaxable: 9310.0,
            tax: 1600.0,
            net: 6639.5,
            payItems: { "Ordinary hours": 9310.0 },
            expenses: {},
            deductions: {},
          },
          {
            employeeId: "2",
            employeeName: "Olivia Grant",
            hours: 150,
            grossTaxable: 4892.5,
            tax: 800.0,
            net: 3529.75,
            payItems: { "Ordinary hours": 4892.5 },
            expenses: {},
            deductions: {},
          },
        ],
        pagination: { total: 2, totalPages: 1 },
      },
    };
  }

  if (path === "/reports/accounting-export") {
    return {
      status: 200,
      data: {
        success: true,
        totalGrossTaxable: 14202.5,
        totalPaygWithholding: 2400.0,
        totalSuperGuarantee: 1633.29,
        totalNetWages: 10169.25,
        wages: {
          lines: [
            { line: 1, title: "Ordinary Wages - Jake Morrison", hours: 380, amount: 9310.0 },
            { line: 2, title: "Admin Wages - Olivia Grant", hours: 150, amount: 4892.5 },
          ],
          total: { hours: 530, amount: 14202.5 },
        },
        payg: {
          lines: [{ line: 1, title: "PAYG Withholding - Employees", amount: 2400.0 }],
          total: 2400.0,
        },
        super: {
          lines: [{ line: 1, title: "Superannuation Expense - SG 11.5%", amount: 1633.29 }],
          total: 1633.29,
        },
        pagination: { total: 4, totalPages: 1 },
      },
    };
  }

  if (path === "/reports/payroll-employee-by-run") {
    return {
      status: 200,
      data: {
        success: true,
        runs: [
          {
            runId: "14",
            period: "fortnightly",
            paymentDate: "2026-10-29",
            employees: [
              { employeeId: "1", employeeName: "Jake Morrison", hours: 76, gross: 1862.0, tax: 320.0, net: 1327.9 },
              { employeeId: "2", employeeName: "Olivia Grant", hours: 30, gross: 978.5, tax: 160.0, net: 705.95 },
            ],
          },
        ],
        pagination: { total: 1, totalPages: 1 },
      },
    };
  }

  if (path === "/reports/payroll-summary-by-run") {
    return {
      status: 200,
      data: {
        success: true,
        runs: [
          {
            runId: "14",
            period: "fortnightly",
            paymentDate: "2026-10-29",
            employeeCount: 2,
            totalHours: 106,
            totalGross: 2840.5,
            totalTax: 480.0,
            totalNet: 2033.85,
            totalSuper: 326.65,
          },
          {
            runId: "13",
            period: "fortnightly",
            paymentDate: "2026-10-15",
            employeeCount: 2,
            totalHours: 106,
            totalGross: 2840.5,
            totalTax: 480.0,
            totalNet: 2033.85,
            totalSuper: 326.65,
          },
        ],
        pagination: { total: 2, totalPages: 1 },
      },
    };
  }

  // Liabilities & Equity
  if (path === "/liability/list") {
    const liabilities = [
      {
        id: "1",
        name: "Toyota HiAce Van Finance",
        subcategory_name: "Vehicle Loan",
        contact_name: "Commercial Bank of Australia",
        contact_email: "loans@cba.example.com",
        client_id: 101,
        price: 38500.0,
        remainingAmount: 24200.0,
        created_at: "2024-03-10T09:00:00Z",
        is_reconciled: true,
        possible_match: 0,
        gst: false,
      },
      {
        id: "2",
        name: "Fluke & Milwaukee Equipment Facility",
        subcategory_name: "Equipment Finance",
        contact_name: "Tradie Finance Australia",
        contact_email: "accounts@tradiefinance.example.com",
        client_id: 102,
        price: 8500.0,
        remainingAmount: 3100.0,
        created_at: "2024-05-18T11:30:00Z",
        is_reconciled: true,
        possible_match: 0,
        gst: true,
      },
    ];
    return {
      status: 200,
      data: {
        success: true,
        data: {
          rows: liabilities,
          paginationData: { total: liabilities.length },
        },
      },
    };
  }

  if (path === "/liability/subcategory-list") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          { account_subcategory_id: 1, name: "Vehicle Loan" },
          { account_subcategory_id: 2, name: "Equipment Finance" },
          { account_subcategory_id: 3, name: "Credit Card" },
          { account_subcategory_id: 4, name: "Director Loan" },
        ],
      },
    };
  }

  if (path.startsWith("/liability/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          id: "1",
          name: "Toyota HiAce Van Finance",
          subcategory_name: "Vehicle Loan",
          contact_name: "Commercial Bank of Australia",
          contact_email: "loans@cba.example.com",
          price: 38500.0,
          remainingAmount: 24200.0,
          created_at: "2024-03-10T09:00:00Z",
          is_reconciled: true,
        },
      },
    };
  }

  if (path === "/equity/list") {
    const equityItems = [
      {
        id: "1",
        name: "Initial Working Capital Introduced",
        subcategory_name: "Owner Capital",
        price: 25000.0,
        remainingAmount: 0.0,
        created_at: "2024-01-15T08:00:00Z",
        is_reconciled: true,
        paid_with_cash: true,
        possible_match: 0,
      },
      {
        id: "2",
        name: "Van Fit-Out & Racking Contribution",
        subcategory_name: "Owner Capital",
        price: 5000.0,
        remainingAmount: 0.0,
        created_at: "2024-03-22T14:15:00Z",
        is_reconciled: true,
        paid_with_cash: true,
        possible_match: 0,
      },
    ];
    return {
      status: 200,
      data: {
        success: true,
        data: {
          rows: equityItems,
          paginationData: { total: equityItems.length },
        },
      },
    };
  }

  if (path === "/equity/category-list") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          { account_subcategory_id: 1, name: "Owner Capital" },
          { account_subcategory_id: 2, name: "Owner Drawings" },
          { account_subcategory_id: 3, name: "Retained Earnings" },
        ],
      },
    };
  }

  if (path.startsWith("/equity/")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          id: "1",
          name: "Initial Working Capital Introduced",
          subcategory_name: "Owner Capital",
          price: 25000.0,
          remainingAmount: 0.0,
          created_at: "2024-01-15T08:00:00Z",
          is_reconciled: true,
          paid_with_cash: true,
        },
      },
    };
  }

  // Reputation & Reviews
  if (path === "/overview" || path === "/feedbacks/completed-references") {
    if (path === "/feedbacks/completed-references") {
      return {
        status: 200,
        data: {
          success: true,
          data: { completed_reference_ids: ["INV-001", "INV-002"], completed_reference_names: [] },
        },
      };
    }
    return {
      status: 200,
      data: {
        success: true,
        data: {
          npsScore: 82,
          totalResponses: 18,
          totalSent: 23,
          promoters: 16,
          passives: 2,
          detractors: 0,
          averageStarRating: 4.9,
          publicReviewClicks: 14,
          promptedForPublicReview: 16,
          average_rating: 4.9,
          total_reviews: 18,
          nps_score: 82,
          promoters_count: 16,
          passives_count: 2,
          detractors_count: 0,
          response_rate: 78,
          google_reviews_count: 14,
        },
      },
    };
  }

  if (path === "/feedbacks") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: "1",
            client_name: "Sarah Jenkins",
            client_email: "sarah@baysidefitness.example.com",
            star_rating: 5,
            total_score: 10,
            feedback_text: "Sam and Jake did an outstanding job upgrading our commercial gym switchboard. Clean work, zero downtime!",
            created_at: "2026-10-18T10:15:00Z",
            reference_name: "Commercial Switchboard & Metering",
            status: "published",
            is_public_review_clicked: true,
          },
          {
            id: "2",
            client_name: "David Chen",
            client_email: "david.chen@example.com",
            star_rating: 5,
            total_score: 10,
            feedback_text: "Fast callout, diagnosed electrical fault in 20 minutes and had power back on safely. Highly recommend!",
            created_at: "2026-10-24T14:30:00Z",
            reference_name: "Emergency Fault Finding",
            status: "published",
            is_public_review_clicked: true,
          },
          {
            id: "3",
            client_name: "Mark Henderson",
            client_email: "m.henderson@palmgrove.example.com",
            star_rating: 5,
            total_score: 9,
            feedback_text: "Very professional team. Clean installation of our dual EV fast chargers and full compliance certification provided.",
            created_at: "2026-11-02T09:45:00Z",
            reference_name: "Dual EV Charger Installation",
            status: "published",
            is_public_review_clicked: false,
          },
        ],
      },
    };
  }

  if (path === "/surveys") {
    return {
      status: 200,
      data: {
        success: true,
        data: [
          {
            id: "1",
            name: "Post-Job Electrical Satisfaction Survey",
            description: "Automated NPS and Google review prompt sent upon job invoice completion.",
            status: "active",
            created_at: "2026-06-01T00:00:00Z",
            questions_data: [],
          },
        ],
      },
    };
  }

  if (path === "/settings" && method === "GET") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          google_place_id: "ChIJ3839210",
          google_review_link: "https://g.page/r/coastal-spark/review",
          auto_send_on_paid_invoice: true,
          minimum_rating_for_google: 4,
          notification_email: "accounts.coastalspark@example.com",
        },
      },
    };
  }

  // Bank Transactions Balances & Classification
  if (path === "/transaction/balance-unmatched-saved") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          balances: {
            total_unmatched: 3840.0,
            total_saved: 68500.0,
          },
        },
      },
    };
  }

  if (path === "/v2/classification/summary") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          total_unclassified: 0,
          total_classified: seed.bankTransactions.length,
        },
      },
    };
  }

  // Unmatched Bank Transactions (v2)
  if (path === "/v2/bank/bank-transactions") {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize || params.page_size || params.limit) || 50;
    const search = String(params["filter_by[search]"] || params.search || "").toLowerCase();

    const unmatchedRaw = seed.bankTransactions.filter((t) => !t.is_reconciled);
    let filtered = unmatchedRaw;
    if (search) {
      filtered = filtered.filter((t) => t.description.toLowerCase().includes(search));
    }
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    const details = paged.map((t) => ({
      bank_transacton_id: t.id || t.bank_transaction_id,
      transaction_id: t.id || t.bank_transaction_id,
      bank_account_id: "1",
      bank_name: t.bank_name || "Coastal Community Bank",
      source: "bank_feed",
      amount: t.amount,
      description: t.description,
      user_description: t.description,
      direction: t.direction || t.type,
      type: t.direction || t.type,
      transaction_date: t.transaction_date || t.date,
      available_amount: t.amount,
      gst_exclude: 0,
      classification_prediction: {
        account_subcategory_id: t.direction === "credit" ? 101 : 142,
        name: t.direction === "credit" ? "Sales income" : "Consumables & Tools",
        confidence: 0.94,
        reason: "matched on supplier description",
        alternatives: [
          {
            account_subcategory_id: t.direction === "credit" ? 102 : 141,
            name: t.direction === "credit" ? "Electrical services" : "Materials & Supplies",
            confidence: 0.82,
          },
        ],
      },
    }));

    return {
      status: 200,
      data: {
        success: true,
        data: {
          bank_transactions: {
            bank_transaction_details: details,
            total: filtered.length,
          },
        },
      },
    };
  }

  // Matched Sole-saved Transactions (v2)
  if (path === "/v2/bank/sole-saved-transactions") {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize || params.page_size || params.limit) || 50;
    const search = String(params["filter_by[search]"] || params.search || "").toLowerCase();

    const matchedRaw = seed.bankTransactions.filter((t) => t.is_reconciled);
    let filtered = matchedRaw;
    if (search) {
      filtered = filtered.filter((t) => t.description.toLowerCase().includes(search));
    }
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    const rows = paged.map((t) => ({
      id: t.id || t.bank_transaction_id,
      transaction_date: t.transaction_date || t.date,
      amount: t.amount,
      direction: t.direction || t.type,
      description: t.description,
      user_description: t.description,
      source: "bank_feed",
      data: [
        {
          entry_id: t.id,
          item_code: t.matched_entity_id ? `REC-${t.matched_entity_id}` : "MATCH",
          amount: t.amount,
          account_subcategory_id: t.account_subcategory_id || (t.direction === "credit" ? 101 : 141),
          name: t.direction === "credit" ? "Sales income" : "Materials & Supplies",
          reference_type: t.matched_entity_type || (t.direction === "credit" ? "invoice" : "expense"),
          client_name: "Coastal Spark Electrical",
        },
      ],
    }));

    return {
      status: 200,
      data: {
        success: true,
        sole_transaction_details: rows,
        total: filtered.length,
      },
    };
  }

  // Generic Bank Transactions & Feed Fallback
  if (path.includes("bulk-transactions") || path.includes("bank-transaction") || path.includes("/transactions")) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit || params.page_size) || 50;
    const start = (page - 1) * limit;
    return {
      status: 200,
      data: {
        success: true,
        data: {
          transactions: seed.bankTransactions.slice(start, start + limit),
          total: seed.bankTransactions.length,
          reconciled_count: seed.bankTransactions.filter((t) => t.is_reconciled).length,
          unreconciled_count: seed.bankTransactions.filter((t) => !t.is_reconciled).length,
        },
      },
    };
  }

  // Dashboard Endpoints
  if (path === "/dashboard/balance") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          current_balance: seed.dashboard.balance,
          total: [
            { month: 5, current_balance: 12200 },
            { month: 6, current_balance: 14500 },
            { month: 7, current_balance: 15300 },
            { month: 8, current_balance: 16800 },
            { month: 9, current_balance: 17400 },
            { month: 10, current_balance: 18450.25 },
          ],
        },
      },
    };
  }

  if (path === "/dashboard/bank-accounts/balance") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          accounts: seed.dashboard.bankAccounts,
          total_balance: seed.dashboard.balance,
        },
      },
    };
  }

  if (path === "/dashboard/cash-flow") {
    return {
      status: 200,
      data: {
        success: true,
        data: seed.dashboard.cashFlowMonths,
      },
    };
  }

  if (path === "/dashboard/gst-set-aside") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          gst_collected: 8240,
          gst_paid: 3120,
          net_gst_payable: 5120,
        },
      },
    };
  }

  if (path === "/dashboard/geographic-insights") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          regions: [
            { name: "Gold Coast", count: 14, revenue: 68500 },
            { name: "Tweed / Northern Rivers", count: 2, revenue: 12400 },
          ],
        },
      },
    };
  }

  // Reports (P&L, Balance Sheet, Cash Flow, BAS, Trial Balance)
  if (path.includes("/reports") || path.includes("/reporting")) {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          revenue: seed.dashboard.totalRevenue,
          expenses: seed.dashboard.totalExpenseAmount,
          net_profit: seed.dashboard.totalRevenue - seed.dashboard.totalExpenseAmount,
          gst_payable: 5120,
          total_assets: 61668,
          total_liabilities: 0,
          equity: 61668,
        },
      },
    };
  }

  // Default fallback for any unmatched GET request
  return {
    status: 200,
    data: {
      success: true,
      data: [],
    },
  };
}

