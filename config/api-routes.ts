// Ported from sole-webapp/config/apiRoutes.js
// Mechanical port: route strings, keys, and nesting are preserved exactly as
// they appear in the source (including a few pre-existing inconsistencies,
// such as missing leading slashes on some paths). Do not "fix" these strings
// without confirming against the backend — other working code may depend on
// the exact string.

const BASE_URL =
  process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api";

const apiRoutes = {
  adminExport: {
    bulk: BASE_URL + "/v2/export/bulk",
  },
  inboundEmail: {
    receiptAddress: BASE_URL + "/inbound-email/receipt-address",
  },
  auth: {
    register: BASE_URL + "/v1/device/register",
    login: BASE_URL + "/auth/login",
    signUp: BASE_URL + "/auth/signup",

    // Step one of the unified form: is this address a returning user?
    checkEmail: BASE_URL + "/auth/check-email",

    // Passwordless sign-in: one endpoint sends the code, two redeem it.
    otpRequest: BASE_URL + "/auth/otp/request",
    otpVerify: BASE_URL + "/auth/otp/verify",
    setPassword: BASE_URL + "/auth/set-password",

    profile: BASE_URL + "/auth/profile",
    refresh: BASE_URL + "/auth/refresh",
    refreshToken: BASE_URL + "/auth/refresh-token",
    verifyEmail: BASE_URL + "/auth/verify-email",
    forgotPassword: BASE_URL + "/auth/forgot-password",
    resendVerificationCode: BASE_URL + "/auth/resend-verification",
    accountActivate: BASE_URL + "/auth/verify-email",

    loginAccountant: BASE_URL + "/auth/login",
    signUpAccountant: BASE_URL + "/v2/accountants/signup",
    checkLink: BASE_URL + "/v2/accountants/check-link",
    checkAccountActive: BASE_URL + "/auth/verification-status",
    validateToken: BASE_URL + "/auth/password-reset/validate",
    resetPassword: BASE_URL + "/auth/reset-password",
    jiraSso: BASE_URL + "/auth/jira/sso",
    jiraIdpMetadata: BASE_URL + "/auth/jira/idp-metadata",
  },
  tenant: {
    resolve: BASE_URL + "/tenants/resolve",
    me: BASE_URL + "/tenants/me",
    branding: BASE_URL + "/tenants/me/branding",
    settings: BASE_URL + "/tenants/me/settings",
    members: BASE_URL + "/tenants/members",
    invite: BASE_URL + "/tenants/members/invite",
    acceptInvite: BASE_URL + "/tenants/invitations/accept",
  },
  superAdmin: {
    myAccess: BASE_URL + "/super/my-access",
    adminUsers: BASE_URL + "/super/admin-users",
    // Removes every grant; the account itself is left as it is.
    adminUser: (userId: string | number) =>
      `${BASE_URL}/super/admin-users/${userId}`,
    featureAccess: BASE_URL + "/super/feature-access",
    analytics: BASE_URL + "/super/analytics",
    tenants: BASE_URL + "/super/tenants",
    tenant: (id: string | number) => `${BASE_URL}/super/tenants/${id}`,
    tenantBranding: (tenantId: string | number) =>
      `${BASE_URL}/super/tenants/branding?tenantId=${encodeURIComponent(tenantId)}`,
    tenantStatus: (id: string | number) =>
      `${BASE_URL}/super/tenants/${id}/status`,
    tenantUsers: (id: string | number) =>
      `${BASE_URL}/super/tenants/${id}/users`,
    tenantStats: (id: string | number) =>
      `${BASE_URL}/super/tenants/${id}/stats`,
    newUsers: BASE_URL + "/super/new-user",
    impersonate: (tenantId: string | number, userId: string | number) =>
      `${BASE_URL}/super/tenants/${tenantId}/impersonate/${userId}`,
    users: BASE_URL + "/super/users",
    // Soft delete; the body carries the typed email and a reason.
    deleteUser: (userId: string | number) =>
      `${BASE_URL}/super/users/${userId}/delete`,

    // Country Configuration Registry — tax rates, thresholds, filing rules and
    // labels per country. See sole-ocr's docs/MULTI_COUNTRY_EXPANSION_PLAN.md §5.
    // The fixed segments (`audit`, `tax-rates`, `thresholds`) are declared before
    // `/:iso2` on the backend, so they are not country codes.
    countries: BASE_URL + "/super/countries",
    country: (iso2: string) =>
      `${BASE_URL}/super/countries/${encodeURIComponent(iso2)}`,
    countryStatus: (iso2: string) =>
      `${BASE_URL}/super/countries/${encodeURIComponent(iso2)}/status`,
    countryPreview: (iso2: string) =>
      `${BASE_URL}/super/countries/${encodeURIComponent(iso2)}/preview`,
    countryPublish: (iso2: string) =>
      `${BASE_URL}/super/countries/${encodeURIComponent(iso2)}/publish`,
    countryDraft: (iso2: string) =>
      `${BASE_URL}/super/countries/${encodeURIComponent(iso2)}/draft`,
    countryVersions: (iso2: string) =>
      `${BASE_URL}/super/countries/${encodeURIComponent(iso2)}/versions`,
    countryVersion: (iso2: string, version: number) =>
      `${BASE_URL}/super/countries/${encodeURIComponent(iso2)}/versions/${version}`,
    countryRollback: (iso2: string, version: number) =>
      `${BASE_URL}/super/countries/${encodeURIComponent(iso2)}/rollback/${version}`,
    countryTaxRates: (iso2: string) =>
      `${BASE_URL}/super/countries/${encodeURIComponent(iso2)}/tax-rates`,
    countryTaxRate: (id: string | number) =>
      `${BASE_URL}/super/countries/tax-rates/${id}`,
    countryThresholds: (iso2: string) =>
      `${BASE_URL}/super/countries/${encodeURIComponent(iso2)}/thresholds`,
    countryThreshold: (id: string | number) =>
      `${BASE_URL}/super/countries/thresholds/${id}`,
    countryAudit: BASE_URL + "/super/countries/audit",

    // The shared chart of accounts. One catalogue for every country: what
    // varies is an account's name in a given country (`labels`) and whether it
    // is offered there (`country_iso2`). Deleting is always soft — journal
    // lines point at these ids. See sole-ocr's docs/MULTI_COUNTRY_REPORTING.md.
    chartOfAccounts: BASE_URL + "/super/chart-of-accounts",
    chartCategories: BASE_URL + "/super/chart-of-accounts/categories",
    chartCategory: (id: string | number) => `${BASE_URL}/super/chart-of-accounts/categories/${id}`,
    chartCategoryRestore: (id: string | number) =>
      `${BASE_URL}/super/chart-of-accounts/categories/${id}/restore`,
    chartAccounts: BASE_URL + "/super/chart-of-accounts/accounts",
    chartAccount: (id: string | number) => `${BASE_URL}/super/chart-of-accounts/accounts/${id}`,
    chartAccountRestore: (id: string | number) =>
      `${BASE_URL}/super/chart-of-accounts/accounts/${id}/restore`,
  },
  // Fitrec runs off the API origin (no /api suffix), so we strip it here.
  fitrec: {
    verifyToken: BASE_URL.split("/api")[0] + "/fitrec/verify-token",
    verifyEmail: BASE_URL.split("/api")[0] + "/fitrec/verify-email",
    linkMember: BASE_URL.split("/api")[0] + "/fitrec/link-member",
  },
  user: {
    addAccInfo: BASE_URL + "/user/update",
    updateUserProfile: BASE_URL + "/user/update_business_profile",
    getUserProfile: BASE_URL + "/user/getProfile",
    userLogout: BASE_URL + "/auth/logout",
    notification: BASE_URL + "/v2/user/notification",
    uploadProfilePicture: BASE_URL + "/user/upload-profile-picture",
    removeProfilePicture: BASE_URL + "/user/remove-profile-picture",
    deleteAccount: BASE_URL + "/user/delete-account",
    // Ported for Pip's onboarding survey (`lib/onboarding-survey/`): GET reads
    // whether this account still owes a referral answer (and the server's
    // own options list), POST saves it. Mirrors
    // sole-webapp/config/apiRoutes.js's `user.referralSource`.
    referralSource: BASE_URL + "/user/referral-source",
  },

  subscription: {
    mySubscription: BASE_URL + "/subscription/my-subscription",
    plans: BASE_URL + "/subscription/plans",
    manage: BASE_URL + "/subscription/manage-session",
    create: BASE_URL + "/subscription/create-session",
    cancel: BASE_URL + "/subscription/cancel-session",
    resume: BASE_URL + "/subscription/resume-session",
    update: BASE_URL + "/subscription/update-session",
    history: BASE_URL + "/subscription/history",
    validateCoupon: BASE_URL + "/subscription/validate-coupon",
    cancelFeedback: BASE_URL + "/subscription/cancel-feedback",
  },

  accountants: {
    list: BASE_URL + "/v2/accountants/permissionList",
    updateAccount: BASE_URL + "/v2/accountants/update",
    delete: BASE_URL + "/v2/accountants/remove",
    sendInvite: BASE_URL + "/v2/accountants/send-invite",
    supportAccess: BASE_URL + "/v2/accountants/add-support-access",
    accounts: BASE_URL + "/v2/accountants/accounts-list",
    accountComment: BASE_URL + "/v2/accountants/accounts/comment",
    refer: BASE_URL + "/v2/accountants/accounts/refer",
    inviteList: BASE_URL + "/v2/accountants/accounts/invite-list",
    accountInviteAction: BASE_URL + "/v2/accountants/accounts/invite-action",
    bulkInviteSend: BASE_URL + "/v2/accountants/bulk-invite-send",
    loginAs: BASE_URL + "/v2/accountants/login-as",
    saveCustomFields: BASE_URL + "/v2/accountants/custom-fields",
    uploadCSV: BASE_URL + "/v2/accountants/upload-csv",
    bulkInvite: BASE_URL + "/v2/accountants/bulk-invite",
    exportProject: BASE_URL + "/v2/accountants/project/exports",
    referStatusSave: BASE_URL + "/v2/accountants/refer-status-save",
    createBeneficiary: BASE_URL + "/v2/accountants/create-beneficiary",
    transferTest: BASE_URL + "/v2/accountants/transfer-test",

    saveProject: BASE_URL + "/v2/accountants/project",
  },
  spm: {
    generateKey: BASE_URL + "/v2/spm/keys/generate",
    listKeys: BASE_URL + "/v2/spm/keys",
    revokeKey: BASE_URL + "/v2/spm/keys/revoke",
    revokeConnection: BASE_URL + "/v2/spm/connections/revoke",
    // Open server-to-server APIs consumed by the Sole SPM portal itself:
    validate: BASE_URL + "/v2/spm/validate",
    connect: BASE_URL + "/v2/spm/connect",
    disconnect: BASE_URL + "/v2/spm/disconnect",
  },
  accountCategory: {
    list: BASE_URL + "/account-categories/list",
  },
  goalTracker: {
    // GET and POST share the same URL — one gets the saved target (plus
    // server-computed progress, which we don't use, see lib/goal-tracker.ts),
    // the other creates/updates it. There's no delete: the backend rejects
    // income_goal <= 0, so a goal can be replaced but never cleared server-side.
    get: BASE_URL + "/goal/tracker",
    save: BASE_URL + "/goal/tracker",
  },
  plannerGoal: {
    list: BASE_URL + "/planner-goal",
    add: BASE_URL + "/planner-goal",
    update: (id: string | number) => `${BASE_URL}/planner-goal/${id}`,
    delete: (id: string | number) => `${BASE_URL}/planner-goal/${id}`,
    info: (id: string | number) => `${BASE_URL}/planner-goal/${id}`,
    addAllocation: (id: string | number) =>
      `${BASE_URL}/planner-goal/${id}/allocations`,
    deleteAllocation: (id: string | number, allocationId: string | number) =>
      `${BASE_URL}/planner-goal/${id}/allocations/${allocationId}`,
  },
  goalFunding: {
    summary: BASE_URL + "/goal-funding/summary",
    cashWallet: BASE_URL + "/goal-funding/cash-wallet",
    cashWalletTopup: BASE_URL + "/goal-funding/cash-wallet/topup",
    cashWalletHistory: BASE_URL + "/goal-funding/cash-wallet/history",
    // Taking cash back out, and removing a movement recorded by mistake.
    cashWalletWithdraw: BASE_URL + "/goal-funding/cash-wallet/withdraw",
    cashWalletMovement: (id: string | number) =>
      `${BASE_URL}/goal-funding/cash-wallet/history/${id}`,
  },
  bankAccounts: {
    list: BASE_URL + "/bank/accounts",
    historicalStatus: (accountId: string | number) =>
      `${BASE_URL}/bank/accounts/${accountId}/historical-status`,
    historicalSync: BASE_URL + "/bank/single/refresh/historical",
  },
  plannerOverview: {
    get: BASE_URL + "/planner-overview",
  },
  expensePlan: {
    list: BASE_URL + "/expense-plan",
    add: BASE_URL + "/expense-plan",
    update: (id: string | number) => `${BASE_URL}/expense-plan/${id}`,
    delete: (id: string | number) => `${BASE_URL}/expense-plan/${id}`,
    info: (id: string | number) => `${BASE_URL}/expense-plan/${id}`,
    upsertLines: (id: string | number) =>
      `${BASE_URL}/expense-plan/${id}/lines`,
  },
  asset: {
    list: BASE_URL + "/assets",
    ocr: {
      upload: BASE_URL + "/upload/s3",
      extract: BASE_URL + "/assets/extract",
      deleteUpload: BASE_URL + "/upload/file/",
    },
    add: BASE_URL + "/assets/create",
    bulkCreate: BASE_URL + "/assets/bulk/create",
    delete: BASE_URL + "/assets/bulk-delete",
    update: BASE_URL + "/assets/update",
    download: BASE_URL + "/assets/download",
    info: BASE_URL + "/assets/details/",
    uploadAttachment: BASE_URL + "/assets/attach",
    deleteAttachment: BASE_URL + "/assets/attach",
    depreciation: {
      create: BASE_URL + "/assets/depreciation",
      list: BASE_URL + "/assets/depreciation",
      summary: BASE_URL + "/assets/depreciation/summary",
      byAsset: BASE_URL + "/assets/depreciation/",
      update: BASE_URL + "/assets/depreciation/",
      delete: BASE_URL + "/assets/depreciation/",
    },
    insurance: {
      list: BASE_URL + "/asset-insurance",
      byAsset: BASE_URL + "/asset-insurance/asset/",
      create: BASE_URL + "/asset-insurance",
      update: BASE_URL + "/asset-insurance/",
      delete: BASE_URL + "/asset-insurance/",
      send: BASE_URL + "/asset-insurance/",
    },
    status: {
      create: BASE_URL + "/assets/status",
      byAsset: BASE_URL + "/assets/status/",
      markReturned: (assetId: string | number) =>
        `${BASE_URL}/assets/status/${assetId}/returned`,
      delete: BASE_URL + "/assets/status/",
    },
    disposal: {
      create: BASE_URL + "/assets/disposal",
      byAsset: BASE_URL + "/assets/disposal/",
      delete: BASE_URL + "/assets/disposal/",
    },
  },
  investment: {
    list: BASE_URL + "/investment-property",
    create: BASE_URL + "/investment-property",
    info: BASE_URL + "/investment-property/",
    documents: BASE_URL + "/investment-property/documents/",
    loan: BASE_URL + "/investment-property/loan/",
    maintenance: BASE_URL + "/investment-property/maintenance/",
    update: BASE_URL + "/investment-property/",
    delete: BASE_URL + "/investment-property/",
    costBase: BASE_URL + "/investment-property/cost-base/",
    costBaseStats: BASE_URL + "/investment-property/cost-base/stats/",
    expenses: BASE_URL + "/investment-property/expenses/",
    assignableExpenses: BASE_URL + "/investment-property/expenses/assignable",
    assignExpenses: BASE_URL + "/investment-property/assign-expenses/",
    income: BASE_URL + "/investment-property/income/",
    rentalScheduleByProperty: BASE_URL + "/investment-property/",
    rentalScheduleItem: BASE_URL + "/investment-property/rental-schedule/",
    invoices: BASE_URL + "/investment-property/invoices/",
    assignInvoices: BASE_URL + "/investment-property/assign-invoices/",
    summary: BASE_URL + "/investment-property/summary/",
    cgtBreakdown: BASE_URL + "/investment-property/cgt-breakdown/",
    cgtTaxImpact: BASE_URL + "/investment-property/cgt-tax-impact/",
    accountantExport: BASE_URL + "/investment-property/accountant-export/",
    useHistoryByProperty: BASE_URL + "/investment-property/",
    portfolioSummary: BASE_URL + "/investment-property/portfolio/summary",
    portfolioExpenseBreakdown:
      BASE_URL + "/investment-property/dashboard/expense-breakdown",
    portfolioIncomeExpense:
      BASE_URL + "/investment-property/dashboard/income-expense",
    portfolioRentCollection:
      BASE_URL + "/investment-property/dashboard/rent-collection",
    portfolioKeyActions:
      BASE_URL + "/investment-property/dashboard/key-actions",
    portfolioCapitalSnapshot:
      BASE_URL + "/investment-property/dashboard/capital-snapshot",
    portfolioPropertyComparison:
      BASE_URL + "/investment-property/dashboard/property-comparison",
    dispose: BASE_URL + "/investment-property/dispose/",
    portfolio: BASE_URL + "/investment-property/portfolio/dashboard",
  },
  assetRegistry: {
    brands: BASE_URL + "/asset-registry/brands",
    types: BASE_URL + "/asset-registry/types",
  },
  liability: {
    add: BASE_URL + "/liability/add",
    viewDetail: BASE_URL + "/liability/",
    update: BASE_URL + "/liability/update",
    delete: BASE_URL + "/liability",
    list: BASE_URL + "/liability/list",
    subcategoryList: BASE_URL + "/liability/subcategory-list",
    undoPaidWithCash: BASE_URL + "/liability/undo-paid-with-cash",
    undoMatch: BASE_URL + "/liability/undo-match",
    uploadAttachment: BASE_URL + "/liability/attach",
    deleteAttachment: BASE_URL + "/liability/attach",
  },
  equity: {
    add: BASE_URL + "/equity/add",
    viewDetail: BASE_URL + "/equity/",
    update: BASE_URL + "/equity/update",
    delete: BASE_URL + "/equity",
    list: BASE_URL + "/equity/list",
    undoPaidWithCash: BASE_URL + "/equity/undo-match",
    subcategoryList: BASE_URL + "/equity/category-list",
    uploadAttachment: BASE_URL + "/equity/attach",
    deleteAttachment: BASE_URL + "/equity/attach",
  },
  quote: {
    list: BASE_URL + "/quote",
    add: BASE_URL + "/v2/quote",
    delete: BASE_URL + "/v2/quote",
    bulkDelete: BASE_URL + "/quote/bulk-delete",
    update: BASE_URL + "/v2/quote/",
    info: BASE_URL + "/v2/quote/",
    history: (quoteId: string | number) =>
      `${BASE_URL}/v2/quote/${quoteId}/history`,
    summary: BASE_URL + "/quote/statistics",
    /** Per-tab counts for the list, across the whole account. */
    statusCounts: BASE_URL + "/quote/status-counts",
    getNo: BASE_URL + "/v2/quote-no",
    default: BASE_URL + "/quote/default",
    download: BASE_URL + "/quote/download",
    /** The unsaved draft, rendered as the real PDF — AddQuote.js's Preview. */
    runtimePreview: BASE_URL + "/quote/runtime-preview",
    /** The server-rendered quote, as PDF or HTML — QuoteInfo.js's own route. */
    preview: (templateId: string | number) =>
      `${BASE_URL}/quote/preview/${templateId}`,
    /**
     * The client-facing accept/reject link (`/quotes/respond?token=`) —
     * unauthenticated, rate-limited by IP, keyed on the emailed token alone.
     */
    publicRespond: BASE_URL + "/v2/quote/public/respond",
    publicRespondAccept: BASE_URL + "/v2/quote/public/respond/accept",
    publicRespondReject: BASE_URL + "/v2/quote/public/respond/reject",
  },
  proposal: {
    list: BASE_URL + "/proposal",
    create: BASE_URL + "/proposal",
    fromTemplate: BASE_URL + "/proposal/from-template",
    info: (id: string | number) => `${BASE_URL}/proposal/${id}`,
    update: (id: string | number) => `${BASE_URL}/proposal/${id}`,
    status: (id: string | number) => `${BASE_URL}/proposal/${id}/status`,
    markPaid: (id: string | number) => `${BASE_URL}/proposal/${id}/mark-paid`,
    send: (id: string | number) => `${BASE_URL}/proposal/${id}/send`,
    events: (id: string | number) => `${BASE_URL}/proposal/${id}/events`,
    step: (id: string | number, stepKey: string) =>
      `${BASE_URL}/proposal/${id}/steps/${stepKey}`,
    templates: BASE_URL + "/proposal/templates",
    contentUpload: BASE_URL + "/proposal/content/upload",
    documentUpload: BASE_URL + "/proposal/documents/upload",
    documentPreview: (proposalId: string | number) =>
      `${BASE_URL}/proposal/${proposalId}/documents/preview`,
    documentFields: (
      proposalId: string | number,
      documentId: string | number,
    ) => `${BASE_URL}/proposal/${proposalId}/documents/${documentId}/fields`,
    documentDelete: (
      proposalId: string | number,
      documentId: string | number,
    ) => `${BASE_URL}/proposal/${proposalId}/documents/${documentId}`,
    delete: (id: string | number) => `${BASE_URL}/proposal/${id}`,
    publicInfo: (token: string) => `${BASE_URL}/proposal/public/${token}`,
    publicEvents: (token: string) =>
      `${BASE_URL}/proposal/public/${token}/events`,
    publicSignedDocument: (token: string) =>
      `${BASE_URL}/proposal/public/${token}/signed-document`,
    publicStripePay: (token: string) =>
      `${BASE_URL}/proposal/public/${token}/stripe-pay`,
  },
  chatbot: {
    chat: BASE_URL + "/internal/chat",
    history: BASE_URL + "/internal/history",
    events: BASE_URL + "/internal/events",
    unreadCount: BASE_URL + "/internal/unread-count",
    markRead: BASE_URL + "/internal/read",
    upload: BASE_URL + "/internal/upload",
    agentMessage: BASE_URL + "/internal/agent-message",
    endAgentChat: BASE_URL + "/internal/end-agent-chat",
    assistant: BASE_URL + "/v2/assistant/chat",
  },
  client: {
    listV2: BASE_URL + "/client",
    listV2OCR: BASE_URL + "/client",
    listForInvoice: BASE_URL + "/client/contacts",
    add: BASE_URL + "/client/",
    addClient: BASE_URL + "/client/",
    addContact: BASE_URL + "/client/v2",
    clientWithProject: BASE_URL + "/client/with-projects",
    bulkInsert: BASE_URL + "/client/bulk/create",
  },
  preview: {},
  expense: {
    ocr: {
      upload: BASE_URL + "/upload/s3",
      extract: BASE_URL + "/expense/extract",
      deleteUpload: BASE_URL + "/upload/file/",
    },
    listOcr: BASE_URL + "/expense/list",
    matched: BASE_URL + "/expense/matched",
    add: BASE_URL + "/v2/expense",
    addV2: BASE_URL + "/v2/expense/",
    updateV2: BASE_URL + "/v2/expense/edit",
    info: BASE_URL + "/v2/expense/",
    summary: BASE_URL + "/expense/statistics",
    addExpenseToProject: BASE_URL + "/v2/expense/add-to-project",
    download: BASE_URL + "/v2/expense/download",
    delete: BASE_URL + "/v2/expense/bulk-delete",
    bulkCreate: BASE_URL + "/expense/bulk/create",
    undoExpenseInvoice: BASE_URL + "/v2/expense/undo-paid-with-cash",
    markInvoiced: BASE_URL + "/expense/mark-invoiced",
    uploadAttachment: BASE_URL + "/v2/expense/attachments",
    deleteAttachment: BASE_URL + `/v2/expense/attachments`,
  },
  budget: {
    list: BASE_URL + "/budget",
    summary: BASE_URL + "/budget/summary",
    stats: BASE_URL + "/budget/stats",
    add: BASE_URL + "/budget",
    update: BASE_URL + "/budget/",
    delete: BASE_URL + "/budget/",
    info: BASE_URL + "/budget/",
    history: (budgetId: string | number) =>
      `${BASE_URL}/budget/${budgetId}/history`,
    status: (budgetId: string | number) =>
      `${BASE_URL}/budget/${budgetId}/status`,
    duplicate: (budgetId: string | number) =>
      `${BASE_URL}/budget/${budgetId}/duplicate`,
    availableExpenses: (budgetId: string | number) =>
      `${BASE_URL}/budget/${budgetId}/available-expenses`,
    expenses: (budgetId: string | number) =>
      `${BASE_URL}/budget/${budgetId}/expenses`,
    expense: (budgetId: string | number, expenseId: string | number) =>
      `${BASE_URL}/budget/${budgetId}/expenses/${expenseId}`,
  },
  invoice: {
    ocr: {
      upload: BASE_URL + "/upload/s3",
      extract: BASE_URL + "/invoice/extract",
      deleteUpload: BASE_URL + "/upload/file/",
    },
    listOCR: BASE_URL + "/invoice/list",
    list: BASE_URL + "/invoice/invoices",
    statusCounts: BASE_URL + "/invoice/invoices/status-counts",
    matched: BASE_URL + "/invoice/matched",
    drafts: BASE_URL + "/invoice/drafts",
    allDrafts: BASE_URL + "/invoice/drafts/all",
    add: BASE_URL + "/invoice/add",
    bulkCreate: BASE_URL + "/invoice/bulk/create",
    bulkDelete: BASE_URL + "/invoice/bulk-delete",
    update: BASE_URL + "/invoice/edit",
    updateRecurringStatus: BASE_URL + "/invoice/recurring/status",
    info: BASE_URL + "/invoice/",
    detail: (invoiceId: string | number) =>
      `${BASE_URL}/invoice/invoices/${invoiceId}`,
    history: (invoiceId: string | number) =>
      `${BASE_URL}/invoice/invoices/${invoiceId}/history`,
    markSent: (invoiceId: string | number) =>
      `${BASE_URL}/invoice/invoices/${invoiceId}/mark-sent`,
    outstandingBalancePreview: (invoiceId: string | number) =>
      `${BASE_URL}/invoice/invoices/${invoiceId}/outstanding-balance/preview`,
    sendOutstandingBalance: (invoiceId: string | number) =>
      `${BASE_URL}/invoice/invoices/${invoiceId}/outstanding-balance/send`,
    paidWithCash: BASE_URL + "/invoice/paid/cash",
    convertToInvoice: BASE_URL + "/invoice/convert-quote",
    followUpReminder: BASE_URL + "/invoice/notify-future-work/email/preview",
    summary: BASE_URL + "/invoice/statistics",
    getNo: BASE_URL + "/invoice/invoice-no",
    sendPaidReceipt: BASE_URL + "/invoice/send-paid-receipt",
    default: BASE_URL + "/invoice/default",
    defaultDetail: (id: string | number) => `${BASE_URL}/invoice/default/${id}`,
    defaultFavourite: (id: string | number) =>
      `${BASE_URL}/invoice/default/${id}/favourite`,
    /** The rendered HTML of a template with demo data — the gallery's Preview. */
    defaultPreview: BASE_URL + "/invoice-default/preview",
  },
  tax: {
    getFinancialYears: BASE_URL + "/tax/getFinancialYears",
    getTaxCalculation: BASE_URL + "/tax/getTaxCalculation",
    income: BASE_URL + "/tax/income",
    expenses: BASE_URL + "/tax/expenses",
    calculateTax: BASE_URL + "/tax/calculateTax",
    getDetails: BASE_URL + "/v2/settings/tax-settings",
  },
  bankConnection: {
    fiskilPopUp: BASE_URL + "/transaction/check/bank/popup",
    connect: BASE_URL + "/bank/connect",
    refresh: BASE_URL + "/bank/refresh",
    singleRefresh: BASE_URL + "/bank/single/refresh",
    refreshCount: BASE_URL + "/bank/count/refresh",
    disconnect: BASE_URL + "/bank/disconnect",
    // New Zealand's feed. The routes above are Fiskil's (Australia). The account
    // list (`bankAccounts.list`) and refresh count are shared by both.
    akahu: {
      connect: BASE_URL + "/bank/akahu/connect",
      callback: BASE_URL + "/bank/akahu/callback",
      refresh: BASE_URL + "/bank/akahu/refresh",
      singleRefresh: BASE_URL + "/bank/akahu/single/refresh",
      historicalStatus: (accountId: string | number) =>
        `${BASE_URL}/bank/akahu/accounts/${accountId}/historical-status`,
      historicalSync: BASE_URL + "/bank/akahu/single/refresh/historical",
      disconnect: BASE_URL + "/bank/akahu/disconnect",
    },
  },
  auditor: {
    // Accountant & Bookkeepper
    add: BASE_URL + "/v1/auditor/add",
    update: BASE_URL + "/v1/auditor/update",
    get: BASE_URL + "/v1/auditor/get",
    addOrUpdate: BASE_URL + "/v1/auditor/addOrUpdate",
  },
  bankAccount: {},
  bankTransaction: {
    addTransactionMultiple: BASE_URL + "/v2/bank/add-transaction-multiple",
    updateTransactionAndMatchMultiple:
      BASE_URL + "/v2/bank/update-transaction-and-match-multiple",
    addTransaction: BASE_URL + "/v2/bank/add-transaction",
    deleteUnmatchedTransaction: BASE_URL + "/v2/bank/transaction-delete",
    bulkDeleteUnmatchedTransaction:
      BASE_URL + "/v2/bank/bulk-transaction-delete",
    deleteSavedTransaction: BASE_URL + "v2/bank/delete-saved-transaction",
    getPossibleMatch: BASE_URL + "/v2/bank/get-possible-match",
    bankTransactions: BASE_URL + "/v2/bank/bank-transactions",
    classificationDecision: BASE_URL + "/v2/classification/decision",
    classificationDecisionBulk: BASE_URL + "/v2/classification/decision/bulk",
    classificationSummary: BASE_URL + "/v2/classification/summary",
    soleTransactions: BASE_URL + "/v2/bank/sole-saved-transactions",
    matchMultipleExpensesAssets:
      BASE_URL + "/v2/bank-transaction/match-multiple-asset-expense",
    markTransaction: BASE_URL + "/v2/bank-transaction/mark-transaction",
    undoMarkTransaction:
      BASE_URL + "/v2/bank-transaction/undo-mark-transaction",
    markCapital: BASE_URL + "v2/bank-transaction/mark-capital",
    bulkMatch: BASE_URL + "v2/bank-transaction/bulk-match",
    bulkMatchNew: BASE_URL + "/v2/bank/transaction-detail-match/bulk",
    setMatchExpenses: BASE_URL + "/v2/bank-transaction/match-asset-expense",
    setMatchLiability: BASE_URL + "/v2/bank-transaction/match-liability",
    setMatchEquity: BASE_URL + "/v2/bank-transaction/match-equity",

    setMatchPropertyIncome:
      BASE_URL + "/v2/bank-transaction/match-property-income",
    setMatchInvoices: BASE_URL + "/v2/bank-transaction/match-invoice",
    setMultipleInvoices:
      BASE_URL + "/v2/bank-transaction/match-multiple-invoice",
    setMultipleLiability:
      BASE_URL + "/v2/bank-transaction/match-multiple-liability",
    setMultipleEquity: BASE_URL + "/v2/bank-transaction/match-multiple-equity",
    setMatch: BASE_URL + "/v2/bank/transaction-detail-match",
    getPossibleMatchExpenses:
      BASE_URL + "v2/bank-transaction/possible-match-assets-expenses/",
    fetchPossibleMatchExpenses:
      BASE_URL + "/v2/bank-transaction/assets-expenses",
    matchCreditNote: BASE_URL + "/v2/bank/credit-note",
    createTransactionMatchCreditNote: BASE_URL + "/v2/bank/credit-note",
    fetchMatchingBalance: BASE_URL + "/transaction/balance-unmatched-saved",
    fetchPossibleMatchTransaction: BASE_URL + "/possible-matches",
    undoMatchTransaction: BASE_URL + "/v2/bank/undo-match-transaction",
    bulkUndoMatchTransaction: BASE_URL + "/v2/bank/bulk-undo-match-transaction",
    markBulkPersonalTransfer: BASE_URL + "/v2/bank-transaction/mark-multiple",
    matchMultipleAssetsExpenses:
      BASE_URL + "/v2/bank/transaction-multiple-assets-expenses",
    matchMultipleInvoices: BASE_URL + "/v2/bank/transaction-multiple-invoices",
    aiSuggestions: BASE_URL + "/v2/bank-transaction/ai-suggestions",
    aiSuggestionAction: BASE_URL + "/v2/bank-transaction/ai-suggestion-action",
    rejectAiSuggestions: BASE_URL + "/v2/bank-transaction/ai-suggestion-action",
  },
  communicationPreference: {
    get: BASE_URL + "/v2/communication-preferences",
    addComPreference: BASE_URL + "/v2/communication-preference",
    addNotification: BASE_URL + "/v2/notification-setting",
    sendReminder: BASE_URL + "/reminder/send-reminder",
  },

  settings: {
    getSeqNumber: BASE_URL + "/v2/settings/get-seq-numbers",
    saveSeqNumber: BASE_URL + "/v2/settings/save-seq-numbers",
    saveInvoiceEmail: BASE_URL + "/v2/settings/save-invoice-email",
    getBranding: BASE_URL + "/v2/settings/get-branding",
    saveBranding: BASE_URL + "/v2/settings/save-branding",
    auditLogs: BASE_URL + "/v2/settings/audit-logs",
    enableTextMessage: BASE_URL + "/v1/enable-text-message",
    getTextMessageStatus: BASE_URL + "/v1/text-message-setting",
  },

  referral: {
    inviteList: BASE_URL + "/v2/invite/list",
    inviteSend: BASE_URL + "/v2/invite/send",
  },

  payrix: {
    accountMap: BASE_URL + "/v1/payrix/accountMap",
    getAccountMap: BASE_URL + "/v1/payrix/getAccountMap",
    createMerchantAccount: BASE_URL + "/v1/payrix/createMerchantAccount",
    updateMerchantAccount: BASE_URL + "/v1/payrix/updateMerchantAccount",
    getMerchantAccount: BASE_URL + "/v1/payrix/getMerchantAccount",
    checkMerchantAccount: BASE_URL + "/v1/payrix/checkMerchantAccount",
    updateInvoiceToggle: BASE_URL + "/v1/payrix/updatePayrixToggle",
    invoiceShowBankDetails: BASE_URL + "/v1/payrix/invoiceShowBankDetails",
    payrixtransactionReport: BASE_URL + "/v1/payrix/transactionReport",
    removeMerchantAccount: BASE_URL + "/v1/payrix/removePayrixAccount",
    saveWorldpayOnboardingDraft:
      BASE_URL + "/v1/payrix/worldpayOnboardingDraft",
    getWorldpayOnboardingDraft:
      BASE_URL + "/v1/payrix/worldpayOnboardingDraft/get",
    report: BASE_URL + "/v1/payrix/reports",
  },

  /**
   * The public, anonymous "pay this invoice" link sole-ocr emails out
   * (`buildWorldpayPayLink` in sole-ocr's worldpayPayLink.js) — a signed
   * session token is the only credential, there's no business_id or bearer
   * token on any of these. Backed by sole-ocr's clientBillingPay router,
   * which forwards to the shared `payments` repo (same code spm's own
   * client-facing payment pages call).
   */
  clientBillingPay: {
    /** `p=` query param from the pay link; the token itself is appended. */
    session: BASE_URL + "/client-billing/pay/session",
    status: BASE_URL + "/client-billing/pay/status",
    token: BASE_URL + "/client-billing/pay/token",
    bankAccount: BASE_URL + "/client-billing/pay/bank-account",
    payToAgreement: BASE_URL + "/client-billing/pay/payto/agreement",
    payToPayment: BASE_URL + "/client-billing/pay/payto/payment",
    /** Agreement reference is appended, to poll approval status. */
    agreement: BASE_URL + "/client-billing/pay/agreement",
  },

  stripeConnect: {
    account: BASE_URL + "/stripe-connect/account",
    onboardingLink: BASE_URL + "/stripe-connect/onboarding/link",
    transactions: BASE_URL + "/stripe-connect/transactions",
    transactionStats: BASE_URL + "/stripe-connect/transactions/stats",
  },

  /**
   * NextTap onboarding. sole-ocr authenticates the user and forwards these to
   * the NextTap service in the payments repo — the browser never calls that
   * service itself.
   */
  nexxtap: {
    industryTypes: BASE_URL + "/nexxtap/industry-types",
    /** The chosen industry is appended, URI-encoded. */
    industryCategories: BASE_URL + "/nexxtap/industry-categories",
    onboarding: BASE_URL + "/nexxtap/onboarding",
    status: BASE_URL + "/nexxtap/onboarding/status",
    saveStep: BASE_URL + "/nexxtap/onboarding/save-step",
    createOrUpdate: BASE_URL + "/nexxtap/onboarding/create-or-update",
    submit: BASE_URL + "/nexxtap/onboarding/submit",
    update: BASE_URL + "/nexxtap/onboarding/update",
    /** A document's id is appended to delete it. */
    documents: BASE_URL + "/nexxtap/onboarding/documents",
  },

  payments: {
    // GET /api/payments/nexxtap/merchant
    // The NextTap merchant account linked to the caller's current business:
    // { using_nexxtap, nexxtap_mid, nexxtap_verified_abn, nexxtap_verified_at }
    nexxtapMerchant: BASE_URL + "/payments/nexxtap/merchant",
    // GET /api/payments/nexxtap/transactions?page=&per_page=&status=&search=
    // The caller's NextTap tap-to-pay captures, mirrored from the payments
    // service. Returns { payments, summary, pagination }.
    nexxtapTransactions: BASE_URL + "/payments/nexxtap/transactions",
  },

  userConfig: {
    worldpayBannerVisibilitySidebar:
      BASE_URL + "/user-config/worldpay-banner-sidebar/visibility",
    worldpayBannerVisibilityFirstLogin:
      BASE_URL + "/user-config/worldpay-banner-first-login/visibility",
    worldpayBannerClose: BASE_URL + "/user-config/worldpay-banner/close",
    fitrecPopupVisibility: BASE_URL + "/user-config/fitrec-popup/visibility",
    fitrecPopupSeen: BASE_URL + "/user-config/fitrec-popup/seen",

    payrixAccount: BASE_URL + "/user-config/payrix/account",

    // Ported for Pip's onboarding survey (`lib/onboarding-survey/`): GET
    // reads which nav ids are already pinned (so the survey doesn't re-offer
    // starter shortcuts to someone who has some), POST saves the ids chosen
    // in the pins step. Mirrors sole-webapp/config/apiRoutes.js's
    // `userConfig.sidebarPins`.
    sidebarPins: BASE_URL + "/user-config/sidebar-pins",

    // How the rail itself is arranged — row order, submenu order, switched-off
    // rows, rows added from More. Separate from the pins because they're
    // separate gestures: one endpoint would make every pin rewrite the layout
    // and every drag rewrite the pins. GET reads the stored layout (an empty
    // one for anybody who has never customised), POST replaces it whole.
    sidebarLayout: BASE_URL + "/user-config/sidebar-layout",

    // One-time popups seen, per (user, business) — the backend's
    // `business_config` table. POST { popup } marks one seen for the active
    // business; what's been seen comes back on the profile as
    // `user.business_config`.
    popupSeen: BASE_URL + "/user-config/popups/seen",
  },

  matchingRules: {
    getAll: BASE_URL + "/v2/matching-rules",
    get: BASE_URL + "/v2/matching-rules/get",
    add: BASE_URL + "/v2/matching-rules/add",
    update: BASE_URL + "/v2/matching-rules/update",
    delete: BASE_URL + "/v2/matching-rules/delete",
    matchTransSync: BASE_URL + "/v2/transactions-matching-rules",
    matchTransSyncStats: BASE_URL + "/v2/transactions-auto-match-count",
  },

  bulkTransaction: {
    bulkInsert: BASE_URL + "/v2/bulk-transactions/bulk-insert",
  },

  migration: {
    aiFormat: BASE_URL + "/v2/migration/ai-format",
  },

  setupGuide: {
    getDetails: BASE_URL + "/v2/user/onboarding-status",
  },

  templates: {
    getList: BASE_URL + "/template/list",
    getDetails: BASE_URL + "/template",
    download: (templateId: string | number) =>
      `${BASE_URL}/template/${templateId}/download`,
    preview: (templateId: string | number) =>
      `${BASE_URL}/template/${templateId}/preview`,
    /**
     * Renders a PDF from data that hasn't been saved yet — what the invoice
     * editor's "Preview" button hits. Takes the same shape as `/invoice/add`,
     * plus which template to render on, so a draft can be seen exactly as it
     * will print before anything is written to the database.
     */
    runtimePreview: BASE_URL + "/template/runtime-preview",
  },

  reporting: {
    reports: BASE_URL + "/report",
    gst: BASE_URL + "/report/gst-extract",
    /** AI + rule review of a BAS period before lodging. Read-only. */
    basReview: BASE_URL + "/v2/bas-review",
    /** Saved review reports; a report's id is appended for one. */
    basReviewReports: BASE_URL + "/v2/bas-review/reports",
    /** Chart of Accounts drill-down; the account's `Subcategory Id` is appended. */
    account: BASE_URL + "/report/account",
    /** Report packs; a pack's id is appended for one, plus /generate, /download and /status. */
    packs: BASE_URL + "/v2/report-packs",
    /** Pack templates; a template's id is appended for one. */
    packTemplates: BASE_URL + "/v2/report-packs/templates",
    /** The reports this business may put in a pack, filtered by its country. */
    packCatalogue: BASE_URL + "/v2/report-packs/catalogue",
    /** Cover logo upload. Business-scoped, so a pack need not exist yet. */
    packCoverImage: BASE_URL + "/v2/report-packs/cover-image",
    /** Live HTML preview of a pack draft — no PDF build. */
    packPreview: BASE_URL + "/v2/report-packs/preview",
  },

  creditNote: {
    list: BASE_URL + "/credit-note",
    add: BASE_URL + "/credit-note",
    update: BASE_URL + "/credit-note",
    generate: BASE_URL + "/credit-note/generate",
  },
  tour: {
    list: BASE_URL + "/tour",
  },

  projects: {
    list: BASE_URL + "/project",
    create: BASE_URL + "/project",
    update: BASE_URL + "/project",
    delete: BASE_URL + "/project",
    info: BASE_URL + "/project/",
    jobs: BASE_URL + "/project-job",
    jobDetail: BASE_URL + "/project-job/",
    deleteJob: BASE_URL + "/project-job/",
    createTask: BASE_URL + "/tasks",
    updateTask: BASE_URL + "/tasks",
    tasks: BASE_URL + "/tasks",
    tasksByClientId: BASE_URL + "/project/tasks",
    taskDetail: BASE_URL + "/tasks/",
    deleteTask: BASE_URL + "/tasks/",
    byClientId: BASE_URL + "/project/client",
    jobsListByProject: BASE_URL + "/project-job/project",
    getAllProject: BASE_URL + "/project",
    statsProject: BASE_URL + "/project/stats",
    statsProjectSummary: BASE_URL + "/project/stats",
    statsProjectTimeChart: BASE_URL + "/project/stats",
    statsProjectBillableBreakdown: BASE_URL + "/project/stats",
    statsProjectTaskStatus: BASE_URL + "/project/stats",
    statsProjectOverdue: BASE_URL + "/project/stats",
    statsProjectFinancialMetrics: BASE_URL + "/project/stats",
    projectExpenseList: BASE_URL + "/v2/expense/project",
    getProjectExpenses: BASE_URL + "/v2/expense",
    getInvoiceList: BASE_URL + "/project/invoiceList",
    getByClientTask: BASE_URL + "/tasks/by-client",
    settings: BASE_URL + "/project/settings",
    initSettings: BASE_URL + "/project/settings/init",
    nextProjectCode: BASE_URL + "/project/settings/next-project-code",
    nextJobCode: BASE_URL + "/project/settings/next-job-code",
    draftList: BASE_URL + "/project/draft-invoice-list",

    timeTracking: {
      list: BASE_URL + "/time-tracking",
      start: BASE_URL + "/time-tracking/start",
      stop: BASE_URL + "/time-tracking",
      active: BASE_URL + "/time-tracking/active",
      bulkUpdate: BASE_URL + "/time-tracking/bulk",
      weekly: BASE_URL + "/time-tracking/weekly",
      listByTask: BASE_URL + "/tasks/time-logs",
      delete: BASE_URL + "/time-tracking",
      statsTime: BASE_URL + "/time-tracking/stats/time-based",
      statsClientProject: BASE_URL + "/time-tracking/stats/client-project",
      manualEntry: BASE_URL + "/tasks/time-tracking/manual-entry",
      generatePdf: BASE_URL + "/time-tracking/generate-pdf",
    },
  },

  fileUpload: {
    document: BASE_URL + "/documents",
  },

  customProduct: {
    list: BASE_URL + "/custom-product",
    create: BASE_URL + "/custom-product",
    update: BASE_URL + "/custom-product",
    delete: BASE_URL + "/custom-product",
    stats: BASE_URL + "/custom-product/stats",
    adjust: (id: string | number) => `${BASE_URL}/custom-product/${id}/adjust`,
    history: (id: string | number) =>
      `${BASE_URL}/custom-product/${id}/history`,
    bulkCreate: BASE_URL + "/custom-product/bulk/create",
  },

  /**
   * Line-item lookup for the document editors. Two separate dictionaries:
   * `services` is the NDIS support catalogue (plus your own products), and
   * `servicesAll` is the general services dictionary (plus your own products).
   * Both return a bare array rather than the usual `{ success, data }` envelope.
   */
  services: {
    autocomplete: BASE_URL + "/services/autocomplete",
  },
  servicesAll: {
    autocomplete: BASE_URL + "/services/all/autocomplete",
  },

  industry: {
    list: BASE_URL + "/industry",
  },

  country: {
    /**
     * The countries a business can be created in — public, no auth. Only
     * registry entries with status `live` come back, so the list is already
     * "what we actually support" rather than every country that exists.
     */
    list: BASE_URL + "/countries",
    /**
     * Which of those live countries the visitor is likely in — from their IP,
     * else the `tz` sent with it. Public; onboarding pre-selects the answer.
     */
    detect: BASE_URL + "/countries/detect",
    /**
     * Look a business up in its country's register — the ABR for Australia,
     * the NZBN register for New Zealand. Server-side on purpose: the ABR call
     * carries a registered GUID, and doing it from the browser shipped that
     * credential to every visitor.
     *
     * Takes `?value=` and an optional `?country=` which overrides the
     * business's own country — onboarding needs that, because the country is
     * being chosen on the same screen and isn't saved yet.
     */
    lookup: BASE_URL + "/country-context/lookup",
    /**
     * Everything the open business's country decides — the tax and its current
     * rate, the financial year, the filing frequencies, the words on a
     * document, the bank-account and identifier fields, and which
     * country-specific products are on.
     *
     * Scoped to the signed-in business, so it answers for THIS set of books
     * rather than for a country in the abstract. `/countries` is the public
     * list for choosing one; this is the one that's chosen.
     */
    context: BASE_URL + "/country-context",
  },

  superContribution: {
    list: BASE_URL + "/v2/super-contribution",
    kpi: BASE_URL + "/v2/super-contribution/matrix",
    delete: BASE_URL + "/v2/super-contribution",
    create: BASE_URL + "/v2/super-contribution",
    details: BASE_URL + "/v2/super-contribution",
    update: BASE_URL + "/v2/super-contribution",
  },

  fund: {
    create: BASE_URL + "/fund",
    list: BASE_URL + "/fund",
  },

  contact: {
    list: BASE_URL + "/client/v2",
    delete: BASE_URL + "/client",
    create: BASE_URL + "/client",
    getDetails: BASE_URL + "/client",
    update: BASE_URL + "/client",
  },

  companyContact: {
    list: BASE_URL + "/contact/list",
    delete: BASE_URL + "/contact",
    update: BASE_URL + "/contact",
    create: BASE_URL + "/contact",
  },
  exchangeRates: {
    getAll: BASE_URL + "/exchange-rates",
  },

  calendar: {
    addCal: BASE_URL + "/calendar/url",
    getAllReminders: BASE_URL + "/calendar",
    deleteReminder: BASE_URL + "/calendar",
    addEvent: BASE_URL + "/calendar",
    editEvent: BASE_URL + "/calendar",
    getEventDetail: BASE_URL + "/calendar",
    getCalendarsList: BASE_URL + "/calendar/list",
    setDefaultCalendar: BASE_URL + "/calendar/default",
    deleteCalendar: BASE_URL + "/calendar/connected",
    getReminderBySearch: BASE_URL + "/calendar/search",
  },

  kmTracker: {
    list: BASE_URL + "/km-tracker",
    stats: BASE_URL + "/km-tracker/stats",
    reports: BASE_URL + "/km-tracker/reports",
    create: BASE_URL + "/km-tracker",
    detail: BASE_URL + "/km-tracker",
    update: BASE_URL + "/km-tracker",
    delete: BASE_URL + "/km-tracker",
    settings: BASE_URL + "/km-tracker/settings",
    rules: BASE_URL + "/km-tracker/rules",
  },

  planner: {
    getAllEvents: BASE_URL + "/planner",
    getPaginatedEvents: BASE_URL + "/planner/stage",
    editEvents: BASE_URL + "/calendar",
    draftEventsInvoice: BASE_URL + "/planner/event",
    getAllListTasks: BASE_URL + "/planner/tasks",
    bulkMoveTasks: BASE_URL + "/planner/tasks/bulk-move-final",
  },

  plannerStage: {
    getAllStages: BASE_URL + "/stage",
    createDefaultStages: BASE_URL + "/stage/default-seed",
  },

  worldpayOnboarding: {
    getMerchantDetails: BASE_URL + "/worldpay/merchant/prefill",
    saveDraft: BASE_URL + "/worldpay/merchant/draft",
    getDraftStatus: BASE_URL + "/worldpay/merchant/draft/status",
    uploadDraftAttachments: BASE_URL + "/worldpay/merchant/draft/attachments",
    submitDraft: BASE_URL + "/worldpay/merchant/draft/submit",
  },

  scheduling: {
    list: BASE_URL + "/schedule/booking-list",
    timeZoneList: BASE_URL + "/schedule/timezones",
    create: BASE_URL + "/schedule/create-complete",
    update: BASE_URL + "/schedule/update",
    rescheduleDragDrop: BASE_URL + "/schedule/reschedule-drag-drop",
    updateBooking: BASE_URL + "/schedule/update-booking",
    getBookingDetails: BASE_URL + "/schedule/booking-details",
    delete: BASE_URL + "/schedule/delete",
    detailBooking: BASE_URL + "/schedule/edit",
    get: BASE_URL + "/schedule/appointment",
    checkSlug: BASE_URL + "/schedule/check-slug/",
    getSetting: BASE_URL + "/schedule/settings/",
    setSetting: BASE_URL + "/schedule/settings/",
    uploadProfilePicture:
      BASE_URL + "/schedule/settings/upload-profile-picture",
    getSlots: BASE_URL + "/schedule/public/available-slots",
    joinSlot: BASE_URL + "/schedule/public/booking/join-booking",
    cancelBooking: BASE_URL + "/schedule/public/booking/cancel",
    calendarEvents: BASE_URL + "/schedule/calendar-events",
    publicBookingDetails: BASE_URL + "/schedule/public/booking/details",
  },

  businesses: {
    list: BASE_URL + "/businesses",
    create: BASE_URL + "/businesses",
    detail: (id: string | number) => `${BASE_URL}/businesses/${id}`,
    update: (id: string | number) => `${BASE_URL}/businesses/${id}`,
    delete: (id: string | number) => `${BASE_URL}/businesses/${id}`,
    setDefault: (id: string | number) => `${BASE_URL}/businesses/${id}/default`,
  },

  dashboard: {
    root: BASE_URL + "/dashboard",
    profitLoss: BASE_URL + "/dashboard/profit/loss",
    balance: BASE_URL + "/dashboard/balance",
    gstSummary: BASE_URL + "/dashboard/gst/summary",
    incomeExpense: BASE_URL + "/dashboard/income/expense",
    topExpenses: BASE_URL + "/dashboard/top/expenses",
    topIncomes: BASE_URL + "/dashboard/top/incomes",
    bankAccountsBalance: BASE_URL + "/dashboard/bank/accounts/balance",
    recentInvoices: BASE_URL + "/dashboard/recent/invoices",
    incomeStatement: BASE_URL + "/dashboard/income/statement",
    invoicesSummary: BASE_URL + "/dashboard/invoices/summary",
  },

  unibox: {
    onboarding: BASE_URL + "/unibox/onboarding",
    skipOnboarding: BASE_URL + "/unibox/onboarding/skip",
    priorities: BASE_URL + "/unibox/priorities",
    expenses: BASE_URL + "/unibox/expenses",
    invoices: BASE_URL + "/unibox/invoices",
    quotes: BASE_URL + "/unibox/quotes",
    sendQuote: (quoteId: string | number) =>
      `${BASE_URL}/unibox/quotes/${quoteId}/send`,
    sendInvoice: (invoiceId: string | number) =>
      `${BASE_URL}/unibox/invoices/${invoiceId}/send`,
    projects: BASE_URL + "/unibox/projects",
    timeTracker: BASE_URL + "/unibox/time-tracker",
    kmTracker: BASE_URL + "/unibox/km-tracker",
    assets: BASE_URL + "/unibox/assets",
    investments: BASE_URL + "/unibox/investments",
    inventory: BASE_URL + "/unibox/inventory",
    liabilities: BASE_URL + "/unibox/liabilities",
    equity: BASE_URL + "/unibox/equity",
    progress: BASE_URL + "/unibox/progress",
    workComingUp: BASE_URL + "/unibox/work-coming-up",
    bankTransactions: BASE_URL + "/unibox/bank-transactions",
    action: BASE_URL + "/unibox/action",
  },

  // Payroll (Microkeeper-backed). Ported from sole-webapp's
  // `config/apiRoutes.js` `payroll` block, grouped by area.
  payroll: {
    overview: BASE_URL + "/payroll/overview",
    subscription: BASE_URL + "/payroll/subscription",
    addSeats: BASE_URL + "/payroll/subscription/add-seats",
    reduceSeats: BASE_URL + "/payroll/subscription/reduce-seats",
    seatInvoices: BASE_URL + "/payroll/subscription/invoices",

    microkeeperConnect: BASE_URL + "/microkeeper/connect",
    microkeeperConnection: BASE_URL + "/microkeeper/connection",
    microkeeperVerify: BASE_URL + "/microkeeper/verify",

    employees: BASE_URL + "/employees",
    employeeStats: BASE_URL + "/employees/stats",
    employeeBulkTemplate: BASE_URL + "/employees/bulk/template",
    employeeBulkUpload: BASE_URL + "/employees/bulk/upload",
    employee: (id: string | number) => `${BASE_URL}/employees/${id}`,
    employeeCompleteness: (id: string | number) =>
      `${BASE_URL}/employees/${id}/completeness`,
    employeeSendEmail: (id: string | number) =>
      `${BASE_URL}/employees/${id}/send-email`,
    employeeDocuments: (id: string | number) =>
      `${BASE_URL}/employees/${id}/documents`,
    employeeDocument: (id: string | number, documentId: string | number) =>
      `${BASE_URL}/employees/${id}/documents/${documentId}`,

    payruns: BASE_URL + "/payruns",
    payrunStatusCounts: BASE_URL + "/payruns/status-counts",
    payrunLastCycle: BASE_URL + "/payruns/last-cycle",
    payrunCompare: BASE_URL + "/payruns/compare",
    payrun: (runId: string | number) => `${BASE_URL}/payruns/${runId}`,
    payrunDetail: (runId: string | number) =>
      `${BASE_URL}/payruns/${runId}/detail`,
    payrunIssues: (runId: string | number) =>
      `${BASE_URL}/payruns/${runId}/issues`,
    payrunDownload: (runId: string | number) =>
      `${BASE_URL}/payruns/${runId}/download`,
    payrunExport: (runId: string | number) =>
      `${BASE_URL}/payruns/${runId}/export`,
    payrunDuplicate: (runId: string | number) =>
      `${BASE_URL}/payruns/${runId}/duplicate`,
    payrunComplete: (runId: string | number) =>
      `${BASE_URL}/payruns/${runId}/complete`,
    payrunEmail: (runId: string | number) =>
      `${BASE_URL}/payruns/${runId}/email`,

    leaveRequests: BASE_URL + "/leave-requests",
    leaveCounts: BASE_URL + "/leave-requests/counts",
    leaveRequest: (id: string | number) => `${BASE_URL}/leave-requests/${id}`,
    leaveDecline: (id: string | number) =>
      `${BASE_URL}/leave-requests/decline/${id}`,
    leaveCancel: (id: string | number) =>
      `${BASE_URL}/leave-requests/cancel/${id}`,

    reportSummary: BASE_URL + "/reports/payroll-summary",
    reportBreakdown: BASE_URL + "/reports/payroll-breakdown",
    reportAccountingExport: BASE_URL + "/reports/accounting-export",
    reportEmployeeByRun: BASE_URL + "/reports/payroll-employee-by-run",
    reportSummaryByRun: BASE_URL + "/reports/payroll-summary-by-run",
  },
} satisfies Record<string, unknown>;

export default apiRoutes;
