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
    addons: [],
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
  params: Record<string, any> = {},
  _body?: any,
): MockResponse | null {
  const normMethod = method.toUpperCase();
  const path = normalizePath(url);
  const seed = getSeedData();

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
              performed_at: new Date().toISOString(),
              performed_by: "Sam Taylor",
              module: "Settings",
              action: "Profile loaded",
              description: "Loaded Coastal Spark Electrical profile",
            },
          ],
          total: 1,
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

  if (path === "/v2/user/notification") {
    return {
      status: 200,
      data: {
        success: true,
        data: {
          notification_details: [
            {
              notification_id: 1,
              title: "Welcome to Coastal Spark Electrical",
              message:
                "All seed data, transactions, quotes, and reports are ready to explore.",
              notification_date: new Date().toISOString(),
              is_read: 1,
            },
          ],
          total: 1,
        },
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
          addons: [],
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

  if (path === "/account-categories/list") {
    if (path === "/account-categories/list" || path === "/account-categories") {
      return {
        status: 200,
        data: {
          success: true,
          data: {
            account_categories: [
              {
                account_category_id: 1,
                name: "Expenses",
                account_subcategories: seed.suppliers.map((s) => ({
                  account_subcategory_id: s.subcategoryId,
                  name: s.category[0] || "General Expense",
                })),
              },
              {
                account_category_id: 2,
                name: "Income",
                account_subcategories: [
                  { account_subcategory_id: 201, name: "Sales" },
                  { account_subcategory_id: 202, name: "Service Income" },
                ],
              },
            ],
            account_categories: seed.accountCategories,
          },
        },
      };
    }

    // Price List / Custom Products
    if (path === "/custom-product" || path === "/products" || path === "/services" || path === "/services/all") {
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
            data: seed.customProducts,
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

      // Single Invoice Detail
      if (path.startsWith("/invoice/invoices/") || (path.startsWith("/invoice/") && !path.includes("/list"))) {
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
      if (path === "/quote/quotes" || path === "/quote/list") {
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
        if (path.startsWith("/quote/quotes/") || (path.startsWith("/quote/") && !path.includes("/list"))) {
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
          if (path.startsWith("/expense/")) {
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

            // Calendar
            if (path === "/calendar") {
              return {
                status: 200,
                data: {
                  success: true,
                  data: seed.calendarEvents,
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

            // Planning / Budgets / Goals / Wallet
            if (path === "/budget" || path.startsWith("/budget/")) {
              return {
                status: 200,
                data: {
                  success: true,
                  data: {
                    budgets: seed.budgets,
                  },
                },
              };
            }

            if (path === "/planner-goal" || path.startsWith("/planner-goal/")) {
              return {
                status: 200,
                data: {
                  success: true,
                  data: seed.goals,
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

            if (path === "/goal-funding/cash-wallet" || path.startsWith("/goal-funding/cash-wallet")) {
              return {
                status: 200,
                data: {
                  success: true,
                  data: seed.cashWallet,
                },
              };
            }

            // Bank Transactions & Feed
            // Bank Accounts
            if (path === "/bank/accounts") {
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
                        balance: 42850.5,
                        available: 42850.5,
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
                  data: { count: seed.matchingRules.length },
                },
              };
            }

            // Superannuation KPI Matrix & Contributions
            if (path === "/v2/super-contribution/matrix") {
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

            // Payroll & Employees
            if (path === "/employees") {
              return {
                status: 200,
                data: {
                  success: true,
                  data: seed.employees.map((emp) => ({
                    ...emp,
                    name: `${emp.first_name} ${emp.last_name}`,
                    status: "active",
                    employment_type: "full_time",
                    start_date: "2024-02-15",
                    tfn_provided: true,
                  })),
                  total: seed.employees.length,
                },
              };
            }

            if (path === "/employees/stats") {
              return {
                status: 200,
                data: {
                  success: true,
                  data: {
                    total: 2,
                    active: 2,
                    onboarding: 0,
                  },
                },
              };
            }

            if (path.startsWith("/employees/")) {
              const id = path.replace("/employees/", "");
              const emp = seed.employees.find((e) => e.id === id) || seed.employees[0];
              return {
                status: 200,
                data: {
                  success: true,
                  data: {
                    ...emp,
                    name: `${emp.first_name} ${emp.last_name}`,
                    status: "active",
                    employment_type: "full_time",
                    start_date: "2024-02-15",
                    tfn_provided: true,
                  },
                },
              };
            }

            if (path === "/payruns" || path === "/payruns/list") {
              return {
                status: 200,
                data: {
                  success: true,
                  data: seed.payruns,
                  total: seed.payruns.length,
                },
              };
            }

            if (path === "/payruns/status-counts") {
              return {
                status: 200,
                data: {
                  success: true,
                  data: {
                    all: 8,
                    completed: 8,
                    draft: 0,
                    processing: 0,
                  },
                },
              };
            }

            if (path === "/payroll/overview") {
              return {
                status: 200,
                data: {
                  success: true,
                  data: {
                    active_employees: 2,
                    last_payrun_date: seed.payruns[0]?.pay_date,
                    next_payrun_date: "2026-11-12",
                    ytd_wages: 56810.0,
                    ytd_tax: 9600.0,
                    ytd_super: 6533.0,
                  },
                },
              };
            }

            if (path === "/payroll/subscription") {
              return {
                status: 200,
                data: {
                  success: true,
                  data: {
                    status: "active",
                    seats: 2,
                    plan: "payroll_standard",
                  },
                },
              };
            }

            if (path === "/leave-requests") {
              return {
                status: 200,
                data: {
                  success: true,
                  data: [],
                  total: 0,
                },
              };
            }

            if (path === "/leave-requests/counts") {
              return {
                status: 200,
                data: {
                  success: true,
                  data: { all: 0, pending: 0, approved: 0, rejected: 0 },
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

