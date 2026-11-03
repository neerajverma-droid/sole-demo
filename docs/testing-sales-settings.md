# Testing: Sales Settings

Reference for test coverage of the Sales settings module: the eight-tab
screen at `/sales/settings` (`app/(app)/sales/settings/page.tsx` →
`components/sales-settings/sales-settings-screen.tsx`) covering numbering,
logo and colours, footer and social links, invoice and quote field toggles,
invoice and quote template styling, and communication preferences. The
screen was ported from sole-webapp's `components/Settings/Branding.js`,
`InvoiceQuoteReferences.js` and `CommunicationPreference.js`.

All three test files are **pre-existing** team work on `feat/api-integration`
(added in `216013d`, "implemented api on sales settings"). This doc describes
them; it doesn't claim them as new work. They're Vitest unit tests running in
a plain `node` environment (no browser, no rendering). The two API files use
the repo's usual convention of mocking `@/utils/axiosInstance` and then
dynamically importing the module under test. For the shared copy-paste
templates (API module, Zustand store, and when a DOM is needed), see
[Writing a new test in this codebase](./testing-coverage.md#writing-a-new-test-in-this-codebase)
in `testing-coverage.md`. They aren't repeated here.

## Running them

```bash
npx vitest run lib/sales-settings.test.ts lib/sales-settings-api.test.ts lib/sales-templates.test.ts
```

As of this doc, **1285 tests pass repo-wide**. The three files below
contribute 71 of them.

| File | Tests | Covers |
|---|---|---|
| `lib/sales-settings.test.ts` | 40 | Pure validators, per-tab issue lists, numbering readers, tab key ownership, slice/defaults/dirty helpers, `migrateSalesSettings`, and the default field toggles |
| `lib/sales-settings-api.test.ts` | 19 | Every exported write call's encrypted payload, logo upload/remove, and the combined `fetchSalesSettings` merge, including the partial-failure path |
| `lib/sales-templates.test.ts` | 12 | `/template/list` mapping (both response shapes), group/kind filtering, thumbnail fallback, `is_default`, and the invoice and quote preview-HTML routes |

---

## Test files

### `lib/sales-settings.test.ts` (40 tests)

Fixtures are one `structuredClone(DEFAULT_SALES_SETTINGS)` with individual
fields overridden. There are no mocks, because the file is entirely pure.

- **`prefixError`**: blank or whitespace-only gives `"Enter a prefix."`.
  `INV` and `INV-2026` pass. An underscore, or 9 characters (`"123456789"`),
  fails with the same message. The 8-character limit is tested at 9, not
  at exactly 8.
- **`nextNumberError`**: blank gives `"Enter a starting number."`. `12.5`,
  `-1` and `abc` all fail. `0` passes, which pins down that zero is allowed.
- **`hexColorError` / `normaliseHex`**: 3- or 6-digit hex passes with or
  without `#`. `blue` and 5-digit `#12345` fail. `normaliseHex("abc")`
  expands to `#AABBCC` and upper-cases. An invalid value falls back to
  `#000000` so the swatch still renders.
- **`phoneError` / `linkError`**: a row that is switched off never fails,
  even with an empty value. Once switched on, it needs a value, and a phone
  also needs 6–12 digits (`"123"` fails, `"234 808 2823"` passes).
- **`settingsTabIssues`**: the defaults pass. Issues come back in on-screen
  key order (`invoicePrefix`, then `nextQuoteNumber`). There's also a
  regression test: blank `refundPrefix` and an invalid `nextRefundNumber`
  produce **no** issues, because credit-note numbering has no field on this
  tab any more.
- **`brandingTabIssues` / `footerTabIssues`**: the defaults pass. Link issues
  are keyed per link as `footer-${key}` (e.g. `footer-facebook`), and the
  phone issue is keyed `footerPhone`.
- **Numbering readers**: `invoiceNumbering`, `quoteNumbering` and
  `refundNumbering` return `{prefix, next}`.
- **`isSalesTab`**: accepts `"branding"` and rejects an unknown id.
- **`TAB_KEYS`**: two regression tests.
  - The Settings tab owns exactly the four invoice and quote numbering keys.
    It no longer owns the credit-note or invoice-email fields.
  - Each Styling tab owns its NDIS slot next to the general/classic slot:
    `["invoiceStyle","ndisInvoiceStyle"]` and
    `["quoteStyle","ndisQuoteStyle"]`.
- **`tabSlice` / `tabDefaults` / `tabDirty`**:
  - `tabSlice` picks only the keys the tab owns, and `tabDefaults` equals the
    slice of the factory defaults.
  - An edit on a different tab doesn't make this tab dirty.
  - A changed owned key does make it dirty.
  - A *cloned but equal* nested object (`footerLinks`) is **not** dirty,
    because the comparison is `JSON.stringify` by value, not by reference.
- **`migrateSalesSettings`**:
  - `undefined` produces the full defaults.
  - A stored flat value wins over the default.
  - A partial `invoiceFields` / `footerPhone` / `footerLinks` is **merged**,
    so untouched sub-keys survive (this is the reason for the nested-merge
    block).
  - An unknown key is dropped.
- **`DEFAULT_SALES_SETTINGS`**: `customerAbn` and `autoPaidReceipt` are off
  for both invoice and quote, and everything else is on.

### `lib/sales-settings-api.test.ts` (19 tests)

The file uses a local `decryptedFieldsFromBody` helper that runs the real
`decryptPayload` from `@/utils/encrypt` over a `{data}` envelope or a
`FormData` `data` field. The tests therefore assert the **decrypted wire
fields**, not only that a call happened. `fetchSalesSettings` tests route
the mocks by exact URL (`routeGet` / `routePost`) and throw on any
unexpected endpoint.

- **`saveSeqNumbersApi`**: one POST to `settings.saveSeqNumber`, whose
  decrypted body is exactly
  `{invoice_prefix, next_invoice_no, quote_prefix, next_quote_no}`. A
  `success:false` response throws the server's own `message`.
- **`saveBrandingApi`** (7 tests):
  - Colours pass through as-is, and every toggle becomes `1`/`0`. The
    defaults' two "off" fields are checked specifically:
    `inv_customer_abn: 0`, `send_paid_invoice_receipt: 0`, and
    `quo_customer_abn: 0`.
  - **A footer link's value is sent only while the link is on.**
    `facebook_url_enabled: 0` goes out, but `facebook_url` is absent even
    when the draft still has leftover text in it.
  - When the phone is on, `phone` is `countryCode + digitsOnly(value)`
    (`"+612348082823"`). When it's off, `phone_enabled: 0` goes out with no
    `phone` key.
  - Blank template slots fall back to sole-webapp's own ids: `1` (invoice),
    `13` (quote), `7` (NDIS invoice), `25` (NDIS quote). A real id such as
    `"42"` is sent unchanged, as a string.
  - `"Create and send invoice"` maps to `"send"`. **`"Do nothing"` maps to
    `"draft"`**, because the server has no value for it.
  - A `success:false` response throws the server's message.
- **`uploadLogoApi`**:
  - The `data:image/png;base64,…` URL becomes a `File` in a **plain
    `FormData`** (`profile_pic`, not encrypted) posted to
    `user.updateUserProfile`. `file.type` is `image/png`, and the result is
    `data.user.profile_pic`.
  - If the response has no URL, the call throws (the test matches
    `"returned no URL"`).
- **`removeLogoApi`**: POSTs an encrypted `{}` to `user.removeProfilePicture`.
- **`saveNotificationPreferenceApi("invoice", true)`**: sends
  `{module, is_email: 1, is_push_notification: 1}` to
  `communicationPreference.addNotification`. Both flags always move
  together.
- **`saveReminderPreferenceApi`**: turning a reminder on sends
  `{type, status: "on", days: 1}`, a fixed one-day default. Turning it off
  sends `{type, status: "off"}` with **no `days` key**.
- **`enableTextMessageApi(true)`**: sends `isToggled: 1`.
- **`fetchSalesSettings`**:
  - **Full merge**: sequence numbers, branding, logo, communication
    preferences and text-message status are combined into one object.
    Numeric template ids become strings (`7` becomes `"7"`). The phone
    `"+61234808282"` is split into `{countryCode: "+61", value: "234808282"}`.
    `is_email` true/false maps to the two BCC flags.
  - **Logo fetch is a POST**: `user.getUserProfile` is never requested with
    GET.
  - **Partial failure**: if `communicationPreference.get` rejects, the
    results that did load (`invoicePrefix`) are kept, and `console.error` is
    called with the rejection.

### `lib/sales-templates.test.ts` (12 tests)

- **`fetchSalesTemplates`** (6 tests):
  - GETs `templates.getList` once. A flat array is mapped into
    `{id: String(id), group, kind}` using `GEN` → General, `CLASSIC` →
    Classic, and `NDIS` → NDIS.
  - A **categorised object** response (`{GEN: [...], NDIS: [...]}`) is
    flattened in the same way.
  - A category outside the three above is dropped.
  - A response with no `data` returns `[]`.
  - The image uses the server `thumbnail` when there is one. Otherwise it
    falls back to `/images/template/NDISTemplate-*` (NDIS) or
    `/images/template/quote-*` (quote). These are matched by prefix regex
    only.
  - `is_default` of `1` or `true` gives `true`. `0` gives `false`.
- **`templatesFor`**: filters on group **and** kind together. Classic
  invoice with no matches returns `[]`.
- **`fetchTemplatePreviewHtml`** (5 tests):
  - An invoice hits `` `${templates.getDetails}/7/details?invoiceId=&useDemo=false` ``.
  - A quote hits `` `${quote.preview("25")}?quoteId=` ``.
  - The HTML is resolved in this order: `data.html`, then a top-level
    `html`, then a bare-string `data`, then the fallback
    `"<p>Template preview not available</p>"`.

---

## Real contract — `lib/sales-settings.ts`

**Types** (verbatim, with comments trimmed):

```ts
export type DocumentNumbering = { prefix: string; next: string };
export type FooterEntry = { enabled: boolean; value: string };
export const FOOTER_LINKS = [
  { key: "website", ... }, { key: "facebook", ... }, { key: "instagram", ... },
  { key: "linkedin", ... }, { key: "tiktok", ... },
] as const;
export type FooterLinkKey = (typeof FOOTER_LINKS)[number]["key"];
export type FooterPhone = FooterEntry & { countryCode: string };
export const COUNTRY_CODES = ["+61", "+64", "+44", "+1", "+65"] as const;

// 12 keys, all in group "Business & Customer Information":
// customerName, customerBusinessName, customerAddress, customerAbn, yourName,
// yourBusinessName, yourBusinessAddress, yourBusinessAbn, itemDescriptions,
// quantityType, gst, autoPaidReceipt
export type DocumentFields = Record<DocumentFieldKey, boolean>;

export const QUOTE_ACCEPTANCE_ACTIONS = [
  "Create invoice as draft", "Create and send invoice", "Do nothing",
] as const;

export type SalesSettings = {
  invoicePrefix: string; nextInvoiceNumber: string;
  quotePrefix: string; nextQuoteNumber: string;
  /** No server field — local only; refundNumbering() still reads it. */
  refundPrefix: string; nextRefundNumber: string;
  logo: string | null; brandColor: string; contentColor: string;
  footerPhone: FooterPhone;
  footerLinks: Record<FooterLinkKey, FooterEntry>;
  invoiceFields: DocumentFields; invoiceNotes: string;
  quoteFields: DocumentFields; quoteNotes: string;
  quoteAcceptanceAction: QuoteAcceptanceAction;
  invoiceStyle: string; quoteStyle: string;       // General/Classic slot
  ndisInvoiceStyle: string; ndisQuoteStyle: string; // NDIS slot
  textMessagesEnabled: boolean; bccInvoiceEmails: boolean; bccQuoteEmails: boolean;
  remindInvoiceDue: boolean; remindInvoiceOverdue: boolean; remindQuoteExpiry: boolean;
};

export type SalesIssue = { key: string; message: string };
export type SalesTab = "settings" | "branding" | "footer" | "invoice-fields"
  | "quote-fields" | "invoice-styling" | "quote-styling" | "communication";
export const SALES_SETTINGS_VERSION = 1;
```

`DEFAULT_SALES_SETTINGS` contains these non-obvious values:

- Numbering: `INV`/`"25"`, `QUO`/`"45410"`, `CRN`/`"5"`.
- Colours: `#4D4DFE` and `#0F1117`.
- Footer: the phone (`+61 234 808 2823`) and website
  (`https://sole.com.au`) are **on**. The other four links are off.
- Styles: `"general-01"`, `"quote-general-01"`, `"ndis-01"` and
  `"quote-ndis-01"`. These are ids from the local `lib/document-styles.ts`
  catalog, not numeric server template ids. See Gaps.
- Communication: `textMessagesEnabled: false` and `bccQuoteEmails: false`.
  The other four flags are `true`.

**Pure functions** (signature, plus the one non-obvious rule for each):

- `prefixError(value)`: `/^[A-Za-z0-9-]{1,8}$/`, tested against the
  **trimmed** value.
- `nextNumberError(value)`: `/^\d+$/` on the trimmed value, so `0` is
  valid.
- `hexColorError(value)`: `/^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/`. The `#`
  is optional while typing.
- `normaliseHex(value)`: strips `#`, expands 3 digits to 6, and upper-cases.
  Anything invalid returns `"#000000"`.
- `phoneError(entry: FooterPhone)`: returns `undefined` when disabled.
  Otherwise the value must be non-blank and `digitsOnly(value).length` must
  be between 6 and 12.
- `linkError(entry)`: returns `undefined` when disabled. Otherwise it needs
  non-blank text; the URL format isn't checked.
- `settingsTabIssues` / `brandingTabIssues` / `footerTabIssues`: return
  issues in on-screen order. Footer keys are `footerPhone` and
  `` `footer-${key}` ``. None of the other five tabs has a validator.
- `invoiceNumbering` / `quoteNumbering` / `refundNumbering(s)`: return
  `{prefix, next}` for the matching document type.
- `isSalesTab(value)`: a type guard over `SALES_TABS`.
- `tabSlice(tab, values)`: returns only `TAB_KEYS[tab]`.
  `tabDefaults(tab)` is `tabSlice(tab, DEFAULT_SALES_SETTINGS)`.
- `tabDirty(tab, values, stored)`: a per-key `JSON.stringify` comparison,
  limited to the tab's own keys.
- `migrateSalesSettings(stored: unknown)`:
  - Only keys already in the defaults are copied, and only if they aren't
    `undefined` or `null`. A stored `null` therefore becomes the default.
  - `invoiceFields`, `quoteFields`, `footerPhone` and `footerLinks` are then
    spread over their defaults. The merge is one level deep: a stored
    `footerLinks.facebook` replaces the whole default entry, not just part
    of it.

`TAB_KEYS` (verbatim):

| Tab | Owns |
|---|---|
| `settings` | `invoicePrefix`, `nextInvoiceNumber`, `quotePrefix`, `nextQuoteNumber` |
| `branding` | `logo`, `brandColor`, `contentColor` |
| `footer` | `footerPhone`, `footerLinks` |
| `invoice-fields` | `invoiceFields`, `invoiceNotes` |
| `quote-fields` | `quoteFields`, `quoteNotes`, `quoteAcceptanceAction` |
| `invoice-styling` | `invoiceStyle`, `ndisInvoiceStyle` |
| `quote-styling` | `quoteStyle`, `ndisQuoteStyle` |
| `communication` | `textMessagesEnabled`, `bccInvoiceEmails`, `bccQuoteEmails`, `remindInvoiceDue`, `remindInvoiceOverdue`, `remindQuoteExpiry` |

## Real contract — `lib/sales-settings-api.ts`

These internal helpers aren't exported, but they decide most of the
behaviour:

- `unwrap(promise, failureMessage)`: throws
  `message || failureMessage` **only when `success === false` exactly**. A
  missing `success` is treated as success. It returns `data.data`.
- `toBool(value, fallback = false)`: `true` for `true`, `1`, `"1"` or
  `"true"`. Returns `fallback` for `undefined` or `null`. Any other value is
  `false`.
- `definedOnly(obj)`: drops `undefined` keys, so a fetch that returns a
  partial result can't blank a store field. It keeps `null` values.

**Every read** runs inside `fetchSalesSettings` through
`Promise.allSettled`. A rejected read is logged with
`console.error("Failed to load part of sales settings:", reason)` and left
out; results that fulfilled are shallow-merged in array order. **No read
checks `success`.** Each one only checks whether `data` is present.

| Function | Method | Route | Body / params | Response envelope | Notes |
|---|---|---|---|---|---|
| `fetchSeqNumbers` (internal) | GET | `apiRoutes.settings.getSeqNumber` → `/v2/settings/get-seq-numbers` | — | `{success, data?: {invoice_prefix?, next_invoice_no?, quote_prefix?, next_quote_no?}}` | Numbers are converted with `String()`. `{}` if there's no `data`. |
| `saveSeqNumbersApi(values)` | POST | `apiRoutes.settings.saveSeqNumber` → `/v2/settings/save-seq-numbers` | `buildEncryptedRequestBody({invoice_prefix, next_invoice_no, quote_prefix, next_quote_no})` | `{success, message?}` | Values go out untrimmed, even though the validator trims. Fallback message: `"Couldn't save invoice & quote numbering."` |
| `fetchBranding` (internal) | GET | `apiRoutes.settings.getBranding` → `/v2/settings/get-branding` | — | `{success, data?: ApiBranding}` | See the mapping notes below. |
| `saveBrandingApi(values: SalesSettings)` | POST | `apiRoutes.settings.saveBranding` → `/v2/settings/save-branding` | `buildEncryptedRequestBody(fields)`, the **full record** every time | `{success, message?}` | See the field list below. Fallback message: `"Couldn't save sales settings."` |
| `fetchLogo` (internal) | **POST** | `apiRoutes.user.getUserProfile` → `/user/getProfile` | `buildEncryptedRequestBody({})` | `{success, data?: {user?: {profile_pic}} \| {profile_pic}}` | Reads `data.user.profile_pic`, falling back to `data.profile_pic`. Always sets `logo` (`null` if empty). |
| `uploadLogoApi(dataUrl)` | POST | `apiRoutes.user.updateUserProfile` → `/user/update_business_profile` | Plain `FormData` with `profile_pic` = `File("logo.jpg")`. **Not encrypted.** | `{success, data?: {user?: {profile_pic}}}` | The MIME type comes from the data URL, defaulting to `image/jpeg`. Throws `"The logo uploaded but the server returned no URL."` Fallback message: `"Couldn't upload that logo."` |
| `removeLogoApi()` | POST | `apiRoutes.user.removeProfilePicture` → `/user/remove-profile-picture` | `buildEncryptedRequestBody({})` | `{success, message?}` | Fallback message: `"Couldn't remove the logo."` |
| `fetchCommunicationPreferences` (internal) | GET | `apiRoutes.communicationPreference.get` → `/v2/communication-preferences` | — | `{success, data?: {notification_setting_details?: [{module, is_email}], reminder_setting?: {inv_before, inv_after, quo_before, …_days}}}` | A BCC flag is set only if its `module` row exists. The three reminder flags are **always** set when `data` is present (`toBool(undefined)` gives `false`). The `*_days` fields are ignored. |
| `fetchTextMessageStatus` (internal) | **POST** | `apiRoutes.settings.getTextMessageStatus` → `/v1/text-message-setting` | `buildEncryptedRequestBody({})` | `{success, data?: {is_text_message?}}` | Returns `{}` when `is_text_message` is `undefined`. |
| `saveNotificationPreferenceApi(module, enabled)` | POST | `apiRoutes.communicationPreference.addNotification` → `/v2/notification-setting` | `buildEncryptedRequestBody({module, is_email, is_push_notification})` (both flags are the same `1`/`0`) | `{success, message?}` | Fallback message: `"Couldn't save that notification preference."` |
| `saveReminderPreferenceApi(type, enabled)` | POST | `apiRoutes.communicationPreference.addComPreference` → `/v2/communication-preference` | `buildEncryptedRequestBody(enabled ? {type, status: "on", days: 1} : {type, status: "off"})` | `{success, message?}` | `type` is `"inv_before"`, `"inv_after"` or `"quo_before"`. Fallback message: `"Couldn't save that reminder."` |
| `enableTextMessageApi(enabled)` | POST | `apiRoutes.settings.enableTextMessage` → `/v1/enable-text-message` | `buildEncryptedRequestBody({isToggled: 1\|0})` | `{success, message?}` | Fallback message: `"Couldn't update text message settings."` |

**`fetchBranding` mapping rules** (none of these is tested directly):

- `footerPhone` is set only if `phone_enabled` or `phone` is present. The
  phone is split with `getCountryCallingAndPhoneNumber(phone, "+61")`.
- `footerLinks` is **always** built when `data` is present. A missing
  `*_enabled` or value becomes `{enabled: false, value: ""}`, so a branding
  response without link fields switches off the default website link.
- `invoiceFields` is set only if `inv_customer_name` is present, and
  `quoteFields` only if `quo_customer_name` is present. Every toggle
  defaults to `true` except `customerAbn` and `autoPaidReceipt`.
- For quotes, `itemDescriptions` is hard-coded to `true` and
  `autoPaidReceipt` to `false`. There's no server field for either.
- `invoice_note` / `quote_note` are ignored when they're `null` or the
  literal string `"null"`.
- `quote_accept_invoice_action`: `"send"` becomes
  `"Create and send invoice"`, `"draft"` becomes
  `"Create invoice as draft"`, and anything else leaves the field
  `undefined` (so the store keeps its current value).
- Template ids are converted with `String()` when they aren't `null`.

**`saveBrandingApi` fields**:

- `brand_color` and `content_color`.
- Invoice toggles as `1`/`0`: `inv_customer_name`,
  `inv_customer_business_name`, `inv_customer_address`, `inv_customer_abn`,
  `inv_sole_user_name`, `inv_sole_business_name`,
  `inv_sole_business_address`, `inv_sole_business_abn`, `inv_display_desc`,
  `show_quantity_type`, `show_gst` and `send_paid_invoice_receipt`.
- The `quo_*` equivalents, excluding the two quote fields that have no
  server counterpart (`itemDescriptions` / `quo_display_desc` and
  `autoPaidReceipt`), plus `quo_show_quantity_type` and `quo_show_gst`.
- `<field>_enabled` for each link, with the link value added only while
  the link is enabled. The field names are `website`, `facebook_url`,
  `instagram_url`, `linkedin_url` and `tiktok_url`.
- `phone_enabled`, plus `phone` only while the phone is enabled.
- `invoice_template: invoiceStyle || 1`, `quote_template: quoteStyle || 13`,
  `ndis_template: ndisInvoiceStyle || 7`, and
  `ndis_quote_template: ndisQuoteStyle || 25`.
- `invoice_note` and `quote_note`.
- `quote_accept_invoice_action`: `"send"` or `"draft"`.

**Values that are never sent** (the module docstring says so explicitly):

- `refundPrefix` / `nextRefundNumber`.
- The quote's `itemDescriptions` toggle.
- The `"Do nothing"` acceptance action, which is sent as `"draft"`.

## Real contract — `lib/sales-templates.ts`

```ts
export type SalesTemplateGroup = "General" | "Classic" | "NDIS";
export type SalesTemplateKind = "invoice" | "quote";
export type SalesTemplate = {
  id: string; name: string; group: SalesTemplateGroup; kind: SalesTemplateKind;
  /** Server thumbnail when the API has one; falls back to a static sample by group/kind. */
  image: string;
  isDefault: boolean;
};
```

- `templatesFor(templates, group, kind)` filters on both group and kind.
- For the internal `mapTemplate`:
  - Any `type` other than `"quote"` becomes `kind: "invoice"`.
  - `name` is trimmed and falls back to `"Template"`.
  - `isDefault` is `true` only for `1` or `true`, so the string `"1"` is
    `false`.
- The fallback image depends on the group and kind:
  - NDIS templates use `NDISTemplate-${(index % 6) + 1}.jpg`.
  - Quotes use `quote-${(Number(id) % 6) + 1}.png`. This one is keyed on
    the **id**, not the index.
  - Everything else uses `Invoice-${(index % 6) + 1}.jpg`.
  - In every case, `index` is the position in the raw array **before**
    unknown categories are filtered out.

| Function | Method | Route | Body / params | Response envelope | Notes |
|---|---|---|---|---|---|
| `fetchSalesTemplates()` | GET | `apiRoutes.templates.getList` → `/template/list` | — | `{success, data?: ApiTemplate[] \| Record<string, ApiTemplate[]>}` | Doesn't check `success`, only whether `data` is present. An object response is flattened with `Object.values().flat()`. Categories other than `GEN`, `CLASSIC` or `NDIS` are dropped. |
| `fetchTemplatePreviewHtml(id, "invoice")` | GET | `` `${apiRoutes.templates.getDetails}/${id}/details?invoiceId=&useDemo=false` `` → `/template/{id}/details?…` | Query string is built into the URL | `{success, data?: {html} \| string, html?}` | Doesn't check `success`. Never throws on an empty response; it returns `"<p>Template preview not available</p>"`. |
| `fetchTemplatePreviewHtml(id, "quote")` | GET | `` `${apiRoutes.quote.preview(id)}?quoteId=` `` → `/quote/preview/{id}?quoteId=` | — | Same | `apiRoutes.templates.preview(id)` (`/template/{id}/preview`) exists but isn't used. |

## `lib/document-styles.ts`: relevance

This is the old, local "fictional" style catalog. The `lib/sales-templates.ts`
docstring says it has been replaced on the Styling tabs. It still has live
consumers:

- `components/sales-settings/fields-tab.tsx` passes
  `findStyle(INVOICE_STYLE_GROUPS | QUOTE_STYLE_GROUPS, values.invoiceStyle | values.quoteStyle)`
  to the Invoice/Quote Customisation "Live preview".
- `components/documents/document-preview.tsx` imports the `DocumentStyle`
  type.
- `DEFAULT_SALES_SETTINGS`'s four style ids are catalog ids from this file.

Exports: `INVOICE_STYLE_GROUPS` (6 General, 4 NDIS, 4 Classic),
`QUOTE_STYLE_GROUPS` (6 General, 4 Classic, 4 NDIS), `allStyles`,
`findStyle`, which falls back to `groups[0].styles[0]` for an unknown id,
and `styleGroupLabel`. Nothing outside the file uses `styleGroupLabel`.
**There is no test file.**

## Stores and hooks

### `stores/sales-settings.ts`: audited, no test file

`useSalesSettingsStore` wraps `persist` (key `"sole-sales-settings"`,
`localStorage`, `skipHydration: true`, `version: SALES_SETTINGS_VERSION`).
It has three pieces of logic:

- `patch(values)` does a **shallow** merge over `settings`. Nested objects
  (`footerLinks`, `invoiceFields`, and so on) are replaced whole, which is
  fine because every caller passes a complete nested object.
- `resetAll()` sets `DEFAULT_SALES_SETTINGS`. Its own comment says it's
  "used by nothing yet", and a repo-wide search agrees.
- `migrate(stored)` returns
  `{settings: migrateSalesSettings(stored?.settings)}`.

Like `stores/rules.ts` in the reference doc, the actions are plain setters.
The real logic, `migrateSalesSettings`, already has five tests in
`lib/sales-settings.test.ts`. The only piece not covered is the
`stored?.settings` unwrap inside `migrate`. Testing it would need the
`localStorage` stub from Template B. It's low value but cheap to add.

Related hooks (no test files):

- `hooks/use-sales-settings-query.ts`: a React Query hook, key
  `["sales-settings"]`, that calls `patch(query.data)`.
- `lib/use-sales-settings.ts`:
  - `useSalesSettings()`: manually rehydrates the store and exposes a
    `hydrated` flag.
  - `useSeededNumber(...)`: re-seeds a document number after hydration,
    **only if** the user hasn't typed over it. This is real branching
    logic, but it's a React hook, so testing it needs a render harness this
    repo doesn't have.

Screen state lives in Jotai atoms in `lib/atoms.ts`: `salesTabAtom`
(default `"settings"`) and `salesDraftAtom` (`Partial<SalesSettings> | null`).

---

## Gaps

These have no test coverage. They're listed here, not fixed.

**`lib/sales-settings-api.ts`**

- **The per-endpoint mapping inside `fetchSalesSettings` is only partly
  asserted.** Nothing checks:
  - the `invoiceFields` / `quoteFields` mapping, including the `toBool(…,
    true)` defaults and the hard-coded quote `itemDescriptions` and
    `autoPaidReceipt`;
  - the `"null"`-string note filter;
  - `quote_accept_invoice_action` values of `"draft"` or anything unknown;
  - `footerPhone` being omitted when neither phone key is present;
  - `footerLinks` being **always** rebuilt, so a response without link
    fields disables the default website link;
  - the reminder flags being forced to `false` when `reminder_setting` is
    missing;
  - `fetchLogo`'s `data.profile_pic` fallback and its `logo: null`
    override;
  - `fetchTextMessageStatus` returning `{}` when there's no status.
- **Failure paths.** Only `saveSeqNumbersApi` and `saveBrandingApi` have a
  `success:false` test. No test covers `unwrap`'s *fallback* message (a
  `success:false` response with no `message`), or the failure paths of
  `uploadLogoApi`, `removeLogoApi`, `saveNotificationPreferenceApi`,
  `saveReminderPreferenceApi` or `enableTextMessageApi`. The fact that a
  missing `success` counts as success isn't pinned down either.
- **"Off" payloads that are untested:**
  - `enableTextMessageApi(false)` (`isToggled: 0`);
  - `saveNotificationPreferenceApi(…, false)` and its `"quote"` module;
  - `saveReminderPreferenceApi("inv_after", …)`.
- `saveBrandingApi` never asserts the full field list. In particular,
  `inv_display_desc`, the `show_*` / `quo_show_*` fields, the notes, and
  the absence of any `quo_display_desc` are unchecked.
- **Untested default-id behaviour (read from the code, not a confirmed bug):**
  - `saveBrandingApi` uses `invoiceStyle || 1` and similar, which only
    catch an *empty* string.
  - If `get-branding` never returns a template id, the store keeps the
    local defaults, such as `"general-01"`, and those strings are sent
    as-is as `invoice_template` and the other template fields.
  - The "blank slot" test uses `""`, not the real defaults, so this path
    isn't exercised.

**`lib/sales-templates.ts`**

- The Invoice fallback image path (`/images/template/Invoice-N.jpg`) isn't
  tested, and neither is the fact that the quote fallback uses `id`, not
  `index`, or that the index is taken before filtering.
- Untested mapping rules: the `name` → `"Template"` fallback, a non-`"quote"`
  `type` defaulting to `invoice`, and `is_default: "1"` evaluating to
  `false`.
- `fetchTemplatePreviewHtml` has no test for a rejected request. Its caller,
  `styling-tab.tsx`, catches the error and shows the same fallback HTML.

**`lib/sales-settings.ts`**

- `SALES_TABS` order and labels, and six of the eight `TAB_KEYS` entries.
  Only `settings` and the two styling tabs are asserted.
- `tabDirty` / `tabSlice` / `tabDefaults` are only exercised for the
  `branding` and `footer` tabs.
- A few rules have no test:
  - `migrateSalesSettings` treating a stored `null` the same as missing;
  - `migrateSalesSettings`'s one-level nested merge;
  - `prefixError` trimming (so `" INV "` passes);
  - `normaliseHex` with surrounding whitespace;
  - `phoneError` at exactly 6 and exactly 12 digits;
  - `prefixError` at exactly 8 characters.

**Files and functions with no test file at all**

- `lib/document-styles.ts`: `findStyle`'s fallback and `allStyles`.
  `styleGroupLabel` is dead code.
- `lib/preview-doc.ts`: `footerParts`, `invoicePreviewDoc` and
  `samplePreviewDoc`. These are pure functions and easy to test. For
  example, `footerParts` skips disabled or blank rows, and the sample
  numbering pads the invoice number to 4 digits but leaves the quote
  number unpadded.
- `stores/sales-settings.ts`, `hooks/use-sales-settings-query.ts` and
  `lib/use-sales-settings.ts`: see the audit above.
- `components/sales-settings/sales-settings-screen.tsx`: none of this
  component's orchestration is tested, and none of it is exported as a
  pure function:
  - `persistTab`'s routing: the Settings tab calls the sequence-number
    endpoint. The Branding tab uploads a logo when it's a `data:` URL,
    removes it when it's `null` and a logo was stored before, then saves
    branding. Tabs in `BRANDING_RECORD_TABS` save the full branding record.
    The Communication tab sends only the switches that changed, in
    parallel.
  - The post-save draft pruning.
  - **"Reset to Default" (`onReset`) only patches the local persisted
    store with `tabDefaults(tab)`.** It makes no API call and clears the
    draft, which makes the tab non-dirty, so Save is disabled. The next
    `useSalesSettingsQuery` fetch then brings back the server values. This
    behaviour isn't tested and may be unintended.
- `components/sales-settings/styling-tab.tsx`: the NDIS gating
  (`isNdisBusinessProfile`) and the General/Classic vs NDIS slot selection
  (`select` / `selectedId`) live inside the component and aren't exported.
- `fields-tab.tsx`'s "Live preview" passes a server template id (such as
  `"7"`) to `findStyle` against the local catalog. Every real id misses and
  falls back to the first catalog style. No test covers this.

---

## Route resolution quick reference

`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`.
In tests, assert against the `apiRoutes.x.y` constant imported from
`@/config/api-routes`, as all three files already do.

| Constant | Resolves to |
|---|---|
| `apiRoutes.settings.getSeqNumber` | `BASE_URL + "/v2/settings/get-seq-numbers"` |
| `apiRoutes.settings.saveSeqNumber` | `BASE_URL + "/v2/settings/save-seq-numbers"` |
| `apiRoutes.settings.getBranding` | `BASE_URL + "/v2/settings/get-branding"` |
| `apiRoutes.settings.saveBranding` | `BASE_URL + "/v2/settings/save-branding"` |
| `apiRoutes.settings.getTextMessageStatus` | `BASE_URL + "/v1/text-message-setting"` |
| `apiRoutes.settings.enableTextMessage` | `BASE_URL + "/v1/enable-text-message"` |
| `apiRoutes.user.getUserProfile` | `BASE_URL + "/user/getProfile"` |
| `apiRoutes.user.updateUserProfile` | `BASE_URL + "/user/update_business_profile"` |
| `apiRoutes.user.removeProfilePicture` | `BASE_URL + "/user/remove-profile-picture"` |
| `apiRoutes.communicationPreference.get` | `BASE_URL + "/v2/communication-preferences"` |
| `apiRoutes.communicationPreference.addNotification` | `BASE_URL + "/v2/notification-setting"` |
| `apiRoutes.communicationPreference.addComPreference` | `BASE_URL + "/v2/communication-preference"` |
| `apiRoutes.templates.getList` | `BASE_URL + "/template/list"` |
| `apiRoutes.templates.getDetails` | `BASE_URL + "/template"` (`/{id}/details?invoiceId=&useDemo=false` appended) |
| `apiRoutes.quote.preview(id)` | `` `${BASE_URL}/quote/preview/${id}` `` (`?quoteId=` appended) |
