# Sales module audit (Invoices, Quotes, Sales Settings, Products & Services)

Date: 14 Nov 2026. Branch: `dev`. Repos: `sole-webapp` (frontend) and `sole-ocr` (backend).
Method: code review of both repos, read-only queries against the dev DB (`soleAppDev`), and a live check of the invoice editor on `localhost:3000`.
Nothing was fixed. Every item below has the file, how to reproduce it, and the best fix.

Severity: **Critical** = wrong money / wrong recipient / data exposure. **High** = feature broken or wrong data. **Medium** = wrong in an edge case. **Low** = polish.

---

## 0. Quick summary

| # | Severity | Module | Bug |
|---|---|---|---|
| B1 | Critical | Invoice / Quote | No upper limit on amounts. DB is non‑strict `double(10,2)`, so anything over 99,999,999.99 is silently clamped. Stored totals differ from what the user typed and previewed. |
| B2 | Critical | Reminders | Overdue reminder cron emails **draft** invoices to the client. |
| B3 | Critical | Notify future work | The follow‑up email sent to the client is the payment‑reminder template; the user's custom message is never included. |
| B4 | Critical | Security | `GET /api/invoice-default/preview` has no auth and renders any `userId` / `invoiceId` passed in the query. |
| B5 | High | Recurring | Editing a recurring invoice hard‑deletes all its schedules and restarts the series from the original start date (type mismatch in the "changed" check). Causes duplicate invoices. |
| B6 | High | Recurring | Daily cron crashes for any recurring invoice that has no `module_emails` row (null deref). That invoice is skipped forever. |
| B7 | High | Recurring | Monthly / quarterly / yearly recurrence uses fixed 30 / 90 / 365 days, so dates drift. |
| B8 | High | Quotes | Deleting an invoice does not reset `quotes.converted` / `invoice_id`. The quote stays locked as "Already converted". 19 such rows on dev. |
| B9 | High | Quotes | Frontend lets you convert an expired quote; backend refuses. Most quotes on dev are expired. |
| B10 | High | Quotes | On client acceptance, if invoice creation fails (plan limit, stock, etc.) the owner notification/email is never sent, and the client sees an error after the quote is already marked accepted. |
| B11 | High | Bank details | BSB / account number inputs allow 20 / 50 characters; backend accepts anything. DB has BSBs of 2–10 digits and account numbers up to 36 chars. |
| B12 | High | Numbering | Web app always sends `invoice_no`, so `settings.next_invoice_no` never advances. Sales Settings shows a stale next number; next‑number lookup scans every invoice with the prefix. |
| B13 | Medium | Invoice | Invoice number has no length / character limit. DB truncates to 30 chars silently (seen in dev data). |
| B14 | Medium | Quotes | Converted invoice due date = quote expiry (or deposit due date), not invoice date + payment terms. |
| B15 | Medium | Quotes | NDIS quote accepted by client is converted with the **general** invoice layout; manual conversion uses the NDIS layout. |
| B16 | Medium | Quotes | Quote / token expiry evaluated in UTC (`T23:59:59.999Z`), so AU/NZ clients lose ~10–13 hours on the last day; list uses `<= today` while respond page uses `< now`. |
| B17 | Medium | Recurring | Child invoice does not copy `invoice_email`, `is_stripe_enabled`, `project_id`, `base_currency`, `exchange_rate_date`, attachments; uses a months‑old exchange rate. |
| B18 | Medium | Recurring | Cron hard‑codes catch‑up start `2026-06-10`; schedules before that date are never processed. |
| B19 | Medium | Notify future work | Fires only when `notify_future_work_date == today` (UTC). One missed cron run = reminder never sent. 1,079 past‑due rows unsent on dev. |
| B20 | Medium | Reminders | Communication tab saves reminder days hard‑coded to 1; backend supports N days. |
| B21 | Medium | Sales settings | Legacy template ids (`default`, `template-1`, `template-4`) stored in `brandings.invoice_template` for 215 rows; `findInvoiceTemplate(Number(id))` returns null for them. |
| B22 | Medium | Sales settings | Every tab saves the **full** branding record, so two tabs open at once overwrite each other. |
| B23 | Medium | Invoice | Plan‑limit error is returned with HTTP 200. |
| B24 | Medium | Invoice | 22 invoices with `mark_as = ''` (invalid enum written in non‑strict mode). |
| B25 | Low | Invoice list | "Send to client" is disabled once `sent_at` is set, so there is no way to resend the invoice email (only "Send reminder"). |
| B26 | Low | Products | `qty_type` enum on products lacks weeks/months/years that invoice lines support; price fields have no cap. |
| B27 | Low | Address dialog | No max length on address / city / state; state is free text. |

---

## 1. How the module works (what I verified)

### Invoice lifecycle
- Chooser: `components/invoices/create-invoice-chooser.tsx` → general (`/invoices/new/general`) or NDIS (`/invoices/new/ndis`, only shown when the business is an NDIS business). "Start from a template" lists `invoices_default` rows.
- Editor: `components/invoices/invoice-editor.tsx`. Draft lives in React state (no autosave, no localStorage). Validation in `lib/invoices.ts` (`documentIssues`, `lineItemErrors`, `depositIssue`, `followUpIssue`, `stockIssues`).
- First‑invoice gate (`invoice-editor.tsx:1041-1051`): if the business has no bank fields (`hasRequiredBankFields`, country‑aware: AU = BSB + account, NZ = account only) or no address (`hasBusinessAddress`), Save opens `add-bank-details-dialog.tsx` / `add-address-dialog.tsx`. Both save through `updateBusinessApi` and invalidate `["businesses"]`, so the editor refreshes.
- Currency / country: everything comes from `/country-context` (`lib/country-context.ts`). AUD/NZD symbol, GST 10%/15%, "ABN" vs "NZBN / GST number", BSB vs none. Base currency is per business (`businesses.base_currency`), so an AU and an NZ business under one user are separate: separate `settings` row (prefix/next number), separate `brandings` row, invoices scoped by `business_id`.
- Payload: `lib/invoice-submit.ts` → `POST /api/invoice/add` (or `/edit`), multipart + AES. `save: 0` = draft, `send: 1` = email, `send: 2` = Save & print (status `sent`, `sent_at` null, `saved_at` set).
- Backend: `controllers/invoice.js:526 createInvoice` → `services/invoice/invoice.js:810`. Totals are **recomputed server‑side** and compared to client totals (2c tolerance) — good. Invoice number via `generateInvoiceNumber` (row lock + unique index `uniq_invoices_no_per_business`). Email is queued (BullMQ) → `invoicePdfGenJob.js` renders PDF, uploads to S3, sends: **To = client.email, CC = selected contacts (`module_emails`), CC owner if "BCC me" notification is on**. Reply‑to = `invoices.invoice_email` (business email).
- Status: `draft | sent | paid | partially_paid`. "Overdue" is derived on the frontend from `due_date < today` (browser local date). "Outstanding" = sent and not yet due.
- Edit: allowed for draft / sent / overdue; blocked in UI for paid, partially paid and bulk‑uploaded (`invoiceEditBlock`). Backend also refuses money/client changes on settled invoices (`invoice.js:1510-1525`).
- Delete: UI blocks paid / partially paid. Backend `deleteInvoice` soft‑deletes, removes journal entries, recurring + schedule rows, releases stock. It does **not** touch the quote that produced it (B8).
- History: `getInvoiceHistoryTimeline` (`invoice.js:3797`) builds events from columns + payment allocations: created, status (sent/saved), reminder sent, deposit requested/paid, outstanding balance sent, partially paid, paid in full. Not recorded: edits, cash‑paid / undo, bank match / unmatch, recurring child generated, automated due/overdue reminders, future‑work reminder, email delivery, client viewed.

### Runtime preview
- Editor "Preview" → `POST /api/template/runtime-preview` with the same payload as save (`fetchInvoiceRuntimePreviewBlob`). Backend (`controllers/templates.js:593`) reads the **current** business row, branding and country context, so a just‑saved ABN/NZBN/bank detail shows immediately (verified live: ABN printed on the preview). Closing the dialog keeps the editor state. With no client selected the preview prints a fake "Demo Client Business".
- Saved PDF (`invoice_file_path`) is regenerated on every send / Save & print, and on list "Send to client". It is **not** regenerated by a plain draft save or by changing branding; the overdue cron attaches whatever file is on `invoice_file_path`.

### Templates (two different things)
1. **Layouts** — `templates` table, 28 rows: invoice Style 1–6 (ids 1,3–7), NDIS Style 1–4 (2,8,9,10), Classic 1–4 (17–20); quote Style 1–6 (11–16), Classic (21–24), NDIS (25–28). Chosen in Sales Settings → Styling tab (`brandings.invoice_template`, `ndis_template`, `quote_template`, `ndis_quote_template`). Defaults 1 / 7 / 13 / 25.
2. **Content templates** — `invoices_default` + `invoice_items_default`. Created from the editor "Save as template" (`save-as-template-dialog.tsx` → `POST /invoice/default`, needs a unique `category` name per user). System ones have `user_id = 0` and are read‑only. Favourites in `invoice_default_favourites`. Applying one seeds items, notes, deposit, template layout; it does not carry client, recurring, follow‑up or attachments.

### Quote lifecycle
- `components/quotes/quote-editor.tsx` → `POST /api/v2/quote`. Status `draft | sent | accepted | rejected`; "Expired" (`valid_till <= today`) and "Converted" (`converted = 1`) are derived.
- Send: `POST /v2/quote/:id/send` → generates a response token (hash stored, expiry = `valid_till` 23:59:59 **UTC**), queues PDF + email with Accept / Reject links to `/quotes/respond?token=`. Resending a sent, unexpired quote is refused by the backend; an expired or declined one is resent with the expiry extended.
- Client page `app/(public)/quotes/respond` → `v2/quote/public/respond(/accept|/reject)`. Accept locks the row, marks accepted, then creates an invoice according to `brandings.quote_accept_invoice_action` (`draft` or `send`), copies contacts + attachments, links `quotes.invoice_id`, notifies the owner (in‑app + email). Reject requires a reason category (+ text for "Other").
- Manual "Convert to invoice" (`invoice.js:1116`): blocked when already converted, rejected, or **expired**; due date = `valid_till`.

### Sales settings → where each field lands
| Tab / field | Stored | Used by |
|---|---|---|
| Invoice / quote prefix + next number | `settings` (per business) | `getNextInvoiceNumber`, `generateInvoiceNumber`, `generateQuoteNumber` |
| Brand / content colour | `brandings` | PDF templates, email templates |
| Logo | user profile picture (`users.profile_pic`) | PDF + emails |
| Footer phone / website / socials | `brandings.*_enabled` + value | PDF footer |
| Field toggles (`inv_*`, `quo_*`, `show_gst`, `show_quantity_type`, `inv_display_desc`) | `brandings` | PDF render only (not the editor) |
| Invoice / quote notes | `brandings.invoice_note`, `quote_note` | Prefilled note on a new document |
| Layout ids | `brandings.invoice_template` etc. | Runtime preview, PDF, conversion |
| Auto paid receipt | `brandings.send_paid_invoice_receipt` | Cash paid / bank match → receipt email |
| Quote acceptance action | `brandings.quote_accept_invoice_action` | `acceptPublicQuote` |
| BCC me on invoice / quote emails | `notification_setting` | `sendInvoiceEmail` CC |
| Due / overdue / quote‑expiry reminders | `reminder_setting` (`inv_before_days`, …) | `communicationReminderCron.js` |
| Show bank details on invoice | `businesses.show_bank_detail_invoice` (via `/v1/payrix/invoiceShowBankDetails`) | PDF + email |
| "SBN"/ABN/NZBN | **not** in sales settings — `businesses.abn` / `business_registration_number` / `tax_registration_number` (Business details) | `documentRenderData.js` → PDF, preview, email |

### Products & services → invoice
- `custom_product_service` (per user, scoped by `business_id` or null). Picker in the editor (`item-lookup-input.tsx` + `lib/invoice-item-search.ts`) merges custom products, the industry general catalogue (`services_all`) and NDIS supports (`services_ndis`). Picking copies name, price, GST flag, qty type and `product_id` onto the line (snapshot; later product edits do not change existing invoices). Deleted products (`is_deleted = 1`) are hidden from the picker.
- Stock: tracked products (`inventory_flag`) are deducted when an invoice becomes sent/paid (`invoiceStock.js`, `stock_deducted` flag), released on delete; drafts hold no stock. Quotes never touch stock.

### Recurring invoices
- Editor "Repeating invoice": frequency (Once off = `day`, weekly, fortnightly, monthly, quarterly, half yearly, yearly), start date, occurrences (blank = unlimited), "review before sending" (`on_occurance` 1 = draft, 2 = send), tag line.
- Save writes `recurring_invoice` + first `schedule_invoice` row. `src/worker/dailyCron.js` runs `processDailyJobs` at 00:00 Australia/Sydney: for each schedule with `schedule_date <= today` it clones the parent (`createNewInvoice`), assigns a new number, writes the next schedule, soft‑deletes the processed one, and queues the email if `on_occurance = 2` (the worker flips the child to `sent` only after the email succeeds).
- "Stop recurring" → `POST /invoice/recurring/status` → soft‑deletes recurring + schedules.

### Notify future work (follow‑up reminder)
- Editor "Follow‑up work reminder": days before due + note + "notify client". Stored in `notify_future_work` with an absolute `notify_future_work_date`. `processNotifyFutureWork` (same midnight cron) emails on that exact date to the owner ("me") or owner + client ("both").

---

## 2. Bugs

### 2.1 Invoice create / edit

#### B1 — Amounts have no upper limit; DB silently clamps (Critical)
- Files: `sole-webapp/lib/invoices.ts:1311 lineItemErrors` (only rejects negatives/letters), `sole-ocr/src/controllers/invoice.js:600-618` (only `price < 0`, `qty <= 0`), `sole-ocr/src/services/invoice/invoice.js:740 createInvoiceItems`. DB: `invoices.total`, `invoice_items.price` are `double(10,2)`; `@@global.sql_mode = ''` (non‑strict).
- Repro: New invoice → price `100000000000000000` → the editor shows `$110,000,000,000,000,000.00`, the preview renders it (verified live), Save works. The stored row has `price = 99999999.99`, `total = 99999999.99`. Dev DB already has `MAX(total) = 99999999.99` and `MAX(price) = 10000000`, which proves clamping happened.
- Fix: add a shared cap (e.g. `MAX_MONEY = 99_999_999.99`, `MAX_QTY = 1_000_000`) in `lib/invoices.ts` (`lineItemErrors`, `invoiceTotalIssue`) and in the backend item loop in `createInvoice` / `updateInvoice` / `createQuote` (`400: "Price can't exceed 99,999,999.99"`). Longer term: enable `STRICT_TRANS_TABLES` on the DB so out‑of‑range values error instead of clamping, and migrate money columns to `DECIMAL(14,2)`.

#### B13 — Invoice number has no length or character rule (Medium)
- Files: `sole-webapp/components/invoices/invoice-editor.tsx:1650` (`<Input>` with no `maxLength`), `sole-ocr/src/services/invoice/invoice.js:369 generateInvoiceNumber` (no length check). Column `invoices.invoice_no varchar(30)`.
- Repro: edit the number, type 40 characters, save. DB stores the first 30 (dev has `"INV-02 Jessica Remus # 4312489"` = exactly 30 chars). The list then shows a number the user never typed; the uniqueness check was done on the untruncated value.
- Fix: `maxLength={30}` + pattern `^[A-Za-z0-9/_\-. ]{1,30}$` in the editor; same check in `generateInvoiceNumber` / `updateInvoice` returning 400.

#### B23 — Plan‑limit failure returned as HTTP 200 (Medium)
- File: `sole-ocr/src/services/invoice/invoice.js:855` (`error.statusCode = 200`), same in `services/v2/quote.js:1091`.
- Repro: user on a plan with `invoice_limit` reached → `POST /invoice/add` answers `200 {success:false}`. The web app handles it, but monitoring / mobile / retries treat it as success.
- Fix: use 402 or 403 and keep `success:false`.

#### B24 — Invoices with empty status (Medium)
- Evidence: `SELECT COUNT(*) FROM invoices WHERE mark_as = ''` → 22 rows (all unsent). Non‑strict MySQL turned an invalid enum into `''`.
- Fix: find the writer (likely bulk import or legacy mobile) and validate `mark_as` before write; data fix `UPDATE … SET mark_as='draft' WHERE mark_as=''` (migration file, run by you).

#### B11 — Bank details dialog accepts wrong lengths; backend never validates (High)
- Files: `sole-webapp/components/invoices/add-bank-details-dialog.tsx:195` (`maxLength={20}` on BSB), `:220` (`maxLength={50}` on account number); `sole-ocr/src/services/businesses.js:365 updateBusiness` — `pickBusinessFields` copies `bsb`, `account_number`, `abn` with **no** validation; `controllers/businesses.js` has none either.
- Repro: AU business → open the dialog → type `12345678` in BSB. The field accepts it; an error only appears on blur/submit. Any client (mobile, old web, API) can save an invalid BSB: dev DB has BSB lengths 2,3,4,5,9,10 and account numbers of 11–36 chars. NZ: account number is not forced into `BB-bbbb-AAAAAAA-SSS` server‑side.
- Fix: frontend — set `maxLength` from the country schema (`branch.pattern` → 6 digits for AU, 15–16 for NZ) and strip non‑digits in `onChange`. Backend — in `updateBusiness` / `createBusiness`, validate `bsb` / `account_number` / `abn` against the country registry (`services/country/*` already has the patterns + `abn_mod89`, `nz_bank_account`) and return 400.

#### B27 — Address dialog has no limits (Low)
- File: `sole-webapp/components/invoices/add-address-dialog.tsx:170-230`. Address line / city / state have no `maxLength`; state is free text with a datalist only.
- Fix: `maxLength` 255 / 100 / 50; make state a select when `rules.regionOptions` is non‑empty.

#### Verified OK (no bug)
- Due date ≥ invoice date (both sides). Deposit < total, percent < 100 (both sides). Discount ≤ 100 % / ≤ line (frontend; backend recomputes). Totals recomputed server‑side with 2c tolerance. Invoice number uniqueness per business, case‑insensitive, including soft‑deleted. Double‑submit guarded by `savingRef`. GST rate comes from country context (10 % AU / 15 % NZ) on both sides; the `GST_PERCENT = 10` constants in `lib/invoices.ts` are only default parameters and the editors always pass `tax.gstPercent`.

### 2.2 Invoice list / row actions

What is hidden or disabled, and when (`components/invoices/invoices-table.tsx:855-1215`):

| Action | Hidden / disabled when |
|---|---|
| Mark as paid (row button) | draft, paid, or nothing outstanding; replaced by Undo on paid/part‑paid |
| Match to transaction | draft ("Finalise the invoice before matching it"), paid, plan without bank matching; hidden when already matched |
| Unmatch | only shown when matched |
| Edit | paid, partially paid, bulk‑uploaded |
| Send to client | draft, already sent (`sent_at` set), client has no email |
| Send reminder | paid, draft |
| Undo paid with cash | only paid + `paid_with_cash` |
| Send paid receipt | only paid |
| Stop recurring | only `is_recurring_invoice` |
| Send NPS | draft, outstanding (not yet paid/overdue), already answered |
| Delete | paid, partially paid |

Backend comparison: backend allows deleting a sent/overdue invoice (same as UI), refuses amount changes on paid (same), `sendInvoiceToClient` promotes drafts (UI is stricter), bank match endpoints do not check `mark_as = 'draft'` (UI only). No mismatch that lets the UI do something the backend forbids, except B9 for quotes.

#### B25 — No way to resend an invoice email (Low)
- File: `invoices-table.tsx:1104-1116`: once `invoice.sentAt` is set the menu item is disabled with "Sent on …". Backend `sendInvoiceToClient` has no such restriction.
- Fix: relabel to "Send again" with the sent date as a hint, like the quotes table does (`lib/quotes.ts:1713 quoteSendAction`).

### 2.3 Recurring invoices

#### B5 — Editing a recurring invoice resets the series and duplicates invoices (High)
- File: `sole-ocr/src/services/invoice/invoice.js:2047-2050` (`handleRecurringInvoiceUpdate`):
  ```js
  const startDateChanged = existingRecurring.start_date !== recurringData.start_date;   // Date vs 'YYYY-MM-DD' string → always true
  const occurrenceChanged = existingRecurring.no_of_occurance !== recurringData.no_of_occurance; // varchar '10' vs number 10 → always true
  ```
  Because both are always true, every edit hits the "critical fields changed" branch: `ScheduleInvoice.destroy({ force: true })` wipes all schedule rows (including the history rows that hold `new_invoice_id`), then `createInitialSchedule` writes `no_of_occurred = 1` with `schedule_date = start_date` (in the past).
- Repro: create a monthly invoice, 12 occurrences, start 1 Jan. Let 3 run. Open the parent, fix a typo in the description, Save. Next midnight the cron sees a schedule dated 1 Jan ≤ today and generates a 4th invoice immediately; the series restarts at occurrence 1 (so 12 more will be produced), and the audit trail of which child came from which schedule is gone.
- Fix: compare normalised values — `formatDate(existingRecurring.start_date) !== recurringData.start_date` and `Number(existingRecurring.no_of_occurance) !== recurringData.no_of_occurance`; when recreating, keep the processed rows (soft delete only) and seed the new schedule from the **next** date after the last processed one, not from the original start.

#### B6 — Cron crashes on recurring invoices without `module_emails` (High)
- File: `sole-ocr/src/services/invoice/recurringInvoice.js:528-531`:
  ```js
  const module_email_data = await ModuleEmails.findOne({ where: { module: 'invoice', module_id: invoice.id } });
  const old_selected_contacts = module_email_data.selected_contacts;   // TypeError when null
  ```
  A `module_emails` row only exists when the user picked extra contacts (`invoice.js:926`). Every other recurring invoice throws, is counted as an error, and is retried (and fails) every day.
- Evidence: dev has 5 pending schedules, 4 of them already due (oldest `2026-09-02`), 1 without a `module_emails` row.
- Fix: `const old_selected_contacts = module_email_data?.selected_contacts ?? [];` and only create the child's `module_emails` row when non‑empty.

#### B7 — Monthly / quarterly / yearly recurrence drifts (High)
- File: `recurringInvoice.js:22-37` (`FREQUENCY_DAYS` monthly = 30, quarterly = 90, halfyearly = 180, yearly = 365; `calculateNextScheduleDate` adds days).
- Repro: monthly invoice starting 31 Jan → next dates 2 Mar, 1 Apr, 1 May, 31 May… after a year the invoice day has moved ~5 days; a yearly invoice slips a day every leap year.
- Fix: use calendar arithmetic (`dayjs(date).add(1, 'month')`, clamping to month end) keyed on the original start day.

#### B17 — Child invoice is an incomplete copy (Medium)
- File: `recurringInvoice.js:214-262 createNewInvoice`. Not copied: `invoice_email` (reply‑to falls back to profile email), `is_stripe_enabled` / `pay_via_stripe` (pay link disappears), `project_id`, `base_currency`, `exchange_rate_date`, `due_reminder`, attachments (`documents`). Multicurrency children reuse the parent's exchange rate forever (`exchange_rate: invoice.exchange_rate`), so a USD client is billed at a stale rate. Totals are copied verbatim, so a GST rate change (e.g. a business that became GST‑registered) is not reflected.
- Fix: copy the missing columns; for multicurrency call `resolveInvoiceRate` for today and recompute via `recalculateInvoiceTotals`; copy documents with `DocumentService.copyDocuments('invoice', parent, 'invoice', child)`.

#### B18 — Hard‑coded catch‑up date (Medium)
- File: `recurringInvoice.js:443` `const recurringCatchupStartDate = '2026-06-10'`. Schedules before that date are never selected, so a series paused by B6 before June never resumes.
- Fix: remove the lower bound (or make it configurable) and process all `schedule_date <= today`.

#### Other recurring edge cases (Medium / Low)
- Child `invoice_date` is the cron run date, not `schedule_date` (`recurringInvoice.js:133`). If the cron is down for 3 days, three children all get today's date and the same due date.
- Occurrences left blank → `no_of_occurance = 0` = **unlimited** (`recurringInvoice.js:80`, `invoice-extras.tsx:988`). The editor does not say this; 113 rows on dev are unlimited.
- "Once off" is stored as `frequency = 'day'` with 1 occurrence; `FREQUENCY_DAYS.day = 1` still exists as a real daily frequency for API callers (1,044 + 19 rows).
- Numbering for children reads `settings.next_invoice_no` without a row lock (`recurringInvoice.js:140`), unlike `generateInvoiceNumber`.
- Cron runs at midnight Sydney for every business; an NZ business gets its invoices dated the previous day in its own timezone, and `formatDate(new Date())` uses the server timezone (UTC on dev).
- Deleting the client of a recurring invoice is not handled (child created with a deleted `client_id`; the email worker skips it silently as "client has no email").

### 2.4 Notify future work (follow‑up reminder)

#### B3 — Client receives a payment reminder instead of the follow‑up message (Critical)
- Files: `recurringInvoice.js:695-735 sendNotifyFutureWorkEmail` → `EmailService.sendReminderEmail({ … tagLine: 'Future Work Reminder' })`; `email.service.js:1348 sendReminderEmail` renders `emailTemplates/invoice_reminder` with amount, due date, bank details and the invoice PDF. `notify_future_work_description` is never passed.
- Repro: invoice with "Follow‑up work reminder" on, note "Time for your annual service", notify client. On the date the client gets "Reminder: Future Work Reminder" asking them to pay an invoice they have already paid; the note is nowhere.
- Fix: add a dedicated `future_work_reminder` email template taking `description`, and a `sendFutureWorkEmail` method; do not attach the invoice PDF or bank details.

#### B19 — Reminder fires only on the exact day, no catch‑up (Medium)
- File: `recurringInvoice.js:746-750` (`notify_future_work_date: today`, `today` from `new Date().toISOString()` = UTC).
- Evidence: 1,079 `notify_future_work` rows on dev have a past date and were never processed.
- Fix: select `notify_future_work_date <= today AND sent_at IS NULL`, add a `sent_at` column instead of soft‑deleting, and compute "today" in the business timezone (the hourly `scheduleAtBusinessLocalHour` helper already exists for other jobs).

#### Also
- Reminders are skipped for drafts (`mark_as != 'draft'`), which is right, but the editor lets you set one on a draft with no warning.
- When `notify_future_work = 'both'` and the client has no email, `recipients` contains `undefined` and SendGrid rejects the whole send (owner copy included).

### 2.5 Automated reminders and receipts

#### B2 — Overdue reminder emails draft invoices (Critical)
- File: `sole-ocr/src/services/invoice/overdueInvoiceCron.js:11-19`:
  ```js
  due_date: { [Op.lt]: fn('NOW') }, mark_as: { [Op.ne]: 'paid' }, due_reminder: 1, due_reminder_sent: 0
  ```
  No `mark_as != 'draft'` and no `sent_at IS NOT NULL`. The editor sends `due_reminder` for drafts too (`lib/invoice-submit.ts:378`).
- Evidence: dev has 2 draft invoices with `due_reminder_sent = 1` (the client was emailed about an invoice they never received) and 2 more queued.
- Fix: add `mark_as: { [Op.in]: ['sent', 'partially_paid'] }` and `sent_at: { [Op.ne]: null }`; also skip when `invoice_file_path` is null rather than sending without the PDF.

#### B20 — Reminder days are hard‑coded to 1 (Medium)
- File: `sole-webapp/lib/sales-settings-api.ts:498 REMINDER_DEFAULT_DAYS = 1`; `components/sales-settings/communication-tab.tsx:64-80` has no days input. Backend `communicationReminderCron.js:141-196` supports any `inv_before_days` / `inv_after_days` / `quo_before_days` and the old app exposed them.
- Fix: add a numeric "days" field per switch (1–30) and send it.

#### Receipts
- Auto paid receipt (`send_paid_invoice_receipt`) is triggered from cash‑paid and bank match; "Send paid receipt" from the list is manual. No dedupe flag, so toggling cash paid → undo → cash paid sends two receipts. Low.

### 2.6 Quotes

#### B8 — Deleted invoice leaves the quote locked as converted (High)
- Files: `sole-ocr/src/services/invoice/invoice.js:6454 deleteInvoice` (never updates `Quotes`); frontend `components/quotes/quotes-table.tsx:827-840` blocks Convert, Edit and Send when `quote.convertedInvoice` is set; backend `convertQuoteToInvoice` and `sendQuoteToClient` refuse when `converted = 1`.
- Evidence: 19 quotes on dev have `invoice_id` pointing to a deleted invoice.
- Fix: in `deleteInvoice`, `Quotes.update({ converted: 0, invoice_id: null }, { where: { invoice_id } })` and write an audit line; frontend should show "Invoice deleted" instead of the number.

#### B9 — UI offers Convert on expired quotes; backend refuses (High)
- Files: `quotes-table.tsx:827-831` (only blocks converted / declined; comment says "everything else can be converted"), backend `invoice.js:1176-1181` throws "This quote has expired and cannot be converted".
- Evidence: 1,255 of 1,272 sent quotes on dev are expired, so this is the common path.
- Fix: decide one rule. Recommended: allow conversion of expired quotes (the business accepted the work) but set the invoice due date from payment terms (see B14); otherwise disable the menu item with "Quote expired — send it again first".

#### B10 — Client accept: owner never notified if invoice creation fails (High)
- File: `services/v2/quote.js:2553-2705 acceptPublicQuote`. The quote is committed as accepted, then `InvoiceService.createInvoice` runs **without** try/catch, and only after it do `createQuoteNotification` and `sendQuoteOwnerStatusEmail` run. Any failure (monthly invoice limit, stock, totals mismatch, DB) → the client gets an error page, the quote stays `accepted` with `converted = 0`, and the owner hears nothing.
- Fix: wrap invoice creation in try/catch, always notify the owner (include "invoice could not be created: <reason>"), and return success to the client.

#### B14 — Converted invoice due date is wrong (Medium)
- Files: `invoice.js:1185 invoiceDueDate = quote.valid_till || due_date`; `services/v2/quote.js:2440 dueDate = quote.deposit_due_date || quote.valid_till || invoiceDate`.
- Repro: quote valid 30 days, accepted on day 28 → invoice due in 2 days. Deposit quote → full invoice due on the deposit date.
- Fix: due date = invoice date + business default payment terms (`DEFAULT_PAYMENT_TERMS` = 7 in the web app); keep the deposit schedule's own due date.

#### B15 — Accepted NDIS quote uses the general layout (Medium)
- File: `services/v2/quote.js:2441 invoiceTemplateId = branding?.invoice_template ?? 1`; manual path `invoice.js:1163` correctly uses `ndis_template`.
- Fix: same branch as the manual path (`quote.quote_type === 'ndis' ? ndis_template : invoice_template`).

#### B16 — Expiry computed in UTC and inconsistently (Medium)
- Files: `services/v2/quote.js:72` (`${validTill}T23:59:59.999Z`), `:565`, `:590`; list filter `services/quote.js:47-66` (`valid_till <= today`, UTC date); frontend `lib/quotes.ts` derives Expired from the browser date.
- Repro: NZ business, quote valid till 20 Nov. On 20 Nov 1pm NZDT (= 00:00 UTC) the client link says "expired"; the owner's list already showed "Expired" the whole day; sending again is allowed because `<= today`.
- Fix: compute expiry at end of day in the **business timezone** (`businesses.timezone`) in one helper and use it everywhere (`> valid_till` consistently).

#### Other quote findings
- `destroyQuote` (`services/v2/quote.js:1531`) deletes accepted / converted quotes with no warning; the UI Delete has no `disabledReason`. Low.
- Quote amounts: same missing cap as B1 (`createQuote` only checks `price < 0`, `qty <= 0`).
- Quote numbering (`generateQuoteNumber:730`) does keep `settings.next_quote_no` in sync for custom numbers — invoices do not (B12). Inconsistent.
- Quote history timeline (`getQuoteHistoryTimeline:1736`) has created / sent / accepted / rejected / converted; no "viewed", "edited", "expiry extended".

### 2.7 Sales settings

#### B12 — Next invoice number never advances from the web app (High)
- Files: `sole-webapp/lib/invoice-submit.ts:353 invoice_no: draft.number` (always sent); `sole-ocr/src/services/invoice/invoice.js:386-404 generateInvoiceNumber` returns early for a custom number **without** updating `settings.next_invoice_no`; `getNextInvoiceNumber:2174` works around it by loading **every** invoice with the prefix (`Op.like prefix%`) and scanning for a gap.
- Repro: Sales Settings shows "Invoice next number 1". Create 50 invoices from the web. Settings still shows 1; the recurring cron (which reads the setting directly, `recurringInvoice.js:143`) loops 50 times through `findOne` to find a free number; a user with 10k invoices loads 10k rows every time the editor opens.
- Fix: when the custom number equals the generated one (or always), advance `next_invoice_no` to `max(current, parsed+1)` inside the same locked transaction — exactly what `syncNextQuoteNo` does for quotes.

#### B21 — Legacy layout ids break template lookup (Medium)
- Evidence: `brandings.invoice_template` values `default` (141), `template-1` (47), `template-4` (27). `controllers/templates.js:525 findInvoiceTemplate` does `Number(templateId)` → `NaN` → no template → preview / PDF falls back or fails. Frontend `fetchInvoiceBranding` just `String()`s it and the styling tab shows nothing selected.
- Fix: data migration mapping `default`/`template-1` → `1`, `template-4` → `5` etc.; add a mapper in `findInvoiceTemplate` for safety.

#### B22 — Tabs overwrite each other (Medium)
- File: `sole-webapp/lib/sales-settings-api.ts:281 saveBrandingApi` always sends the full record; backend `createOrUpdateBranding` updates every key present.
- Repro: open Sales Settings in two tabs; change colour in tab A and save; change a footer link in tab B and save → colour reverts.
- Fix: send only the dirty tab's keys (backend already supports partial updates), or re‑fetch before save.

#### Also
- Prefix validation: frontend `prefixError` allows `[A-Za-z0-9-]{1,8}`; backend `saveSeqNumbers` accepts anything (dev has `INV-CR8701`, `3MW-INV-25`, `MBrown-Inv` — 10+ chars). Mobile/old clients can store prefixes the web app then refuses to re‑save. Low.
- Next number `0` is accepted by the UI (`^\d+$`) and silently becomes 1 on the server. Low.
- Quote tab "Item descriptions" toggle, the "Do nothing" acceptance option and credit‑note numbering are local‑only state with no server field (documented in `sales-settings-api.ts` header). See §3.
- 277 `settings` rows have `business_id = NULL` (pre multi‑business). `buildOwnershipWhere` with a business scope cannot see them, so those users got a fresh `INV-/1` row and their old prefix was lost. Low (one‑off migration).
- "SBN" / ABN is not editable in Sales Settings at all; it lives in Business details. The preview does reflect a change immediately (`runTimePreview` reads the business row each time and `updateBusiness` calls `invalidateBusiness`). Verified.

### 2.8 Products & services

#### B26 — Product model vs invoice line mismatch, no price cap (Low)
- Files: `sole-ocr/src/controllers/customProductService.js:127` (`qty_type` must be items/hours/days/km) while `invoice_items.qty_type` also allows weeks/months/years; `selling_price` / `cost_price` are not validated (column `decimal(10,2)`, same clamping as B1); `item_name` has no length limit; `sku` is not unique.
- Fix: align the enum (migration), validate prices (`0 ≤ price ≤ 99,999,999.99`), `maxLength` on name/sku, unique `(business_id, sku)` when sku is set.

#### Also
- `generalProductsAndServiceList` and `ndisProductsAndServiceList` ignore `business_id` ownership (they are shared catalogues — fine) but `customProductsAndServiceList` shows `business_id IS NULL` products to every business of the user, so a product created before multi‑business appears in both the AU and NZ business pickers with the AU GST flag. Low.
- Bulk create skips duplicates by name + industry + txn type but single create does the same check only for the exact trimmed lower‑case name; `"Service A "` vs `"service a"` is deduped, `"Service-A"` is not. Low.
- No "used in N invoices" / usage history for a product; delete is soft (`is_deleted`) and does not warn when the product is on open invoices.

### 2.9 Templates, preview, PDF

#### B4 — Unauthenticated preview endpoint exposes other users' data (Critical)
- Files: `sole-ocr/src/routes/defaultInvoice.js:6` (`router.get('/preview', previewTemplate)` — no `PrivateAuth`), `controllers/defaultInvoice.js:9` reads `invoiceId`, `userId`, `business_id`, `useDemo` from the query and calls `getTemplateDetails(templateId, invoiceId, isDemoMode, userId, …)`.
- Repro: `GET /api/invoice-default/preview?useDemo=false&userId=<any>&invoiceId=<any default template id>` with no token returns rendered HTML containing that user's business name, ABN, bank details, logo and the template's items.
- Fix: add `PrivateAuth` and derive `userId` / business from the session, never from the query. Same for `/api/template/categories` and `/api/template/category/:id` (harmless but unauthenticated).

#### Also
- Runtime preview with no client prints "Demo Client Business / 456 Client Street" (`controllers/templates.js` demo fallback). Users think the client was auto‑filled. Low (UX).
- Preview and final PDF share `generateTemplatePdf`, so they match. Verified.
- Templates escape user text (`templates/helper/index.js:15 escapeHtml`) — no XSS found in line items; notes go through the same helpers.
- Large numbers render but overflow nothing because `toLocaleString('en-AU')` is used; with B1 the PDF after save will show a different (clamped) figure than the preview.
- "Save as template" requires only a unique name; it drops the client, recurring, follow‑up and attachments silently (`controllers/invoice.js:1861 createDefaultInvoice`). Low (document it in the dialog).

### 2.10 Multi‑country (AU / NZ)

Verified working: GST 10 % vs 15 % from the country registry; "TAX INVOICE" only when tax‑registered; NZ has no BSB row; NZBN + GST number labels; NZD symbol; per‑business settings/branding/sequences; invoices carry `base_currency`.

Gaps:
- Everything date‑based (recurring, future‑work, quote expiry, overdue derivation on the frontend) uses UTC or Sydney, not `businesses.timezone` (B16, B19, §2.3).
- `resolveInvoiceEmail` (`invoice.js:503`) falls back to the user's **first** business by id when no business scope is present (public quote accept path), so an NZ quote accepted by a client can stamp the AU business email as reply‑to. Medium.
- NDIS invoice/quote option is gated by industry only (`isNdisBusinessProfile`), and `/api/services/autocomplete` by `requireCountryFeature('ndis')`; an NZ business with the NDIS industry sees the NDIS chooser card but the support search 403s. Low.
- Dev data: only 12 NZ businesses, all without bank details; NZ flows are effectively untested in data.

---

## 3. Missing / no backend

| Area | What the UI implies | Reality |
|---|---|---|
| Sales settings → reminder days | "Sent the day before" | days input missing; backend supports N days (B20) |
| Sales settings → Quote "Item descriptions" toggle | saves | local state only, no `quo_display_desc` column |
| Sales settings → Quote acceptance "Do nothing" | option | server only has `draft` / `send` |
| Sales settings → Credit note numbering | prefix/next number | no server field |
| Invoice history | full timeline | no edit / cash paid / undo / match / unmatch / auto‑reminder / future‑work / recurring‑child / viewed events |
| Quote history | | no viewed / edited / expiry‑extended events |
| Future‑work reminder to client | custom message | not implemented (B3) |
| Resend invoice email | | no UI (B25) |
| Recurring | "next run on …", list of generated children | no endpoint returns the schedule; `schedule_invoice` is never surfaced |
| Recurring | pause / skip one occurrence | only stop |
| Products | "used in N invoices", stock history per invoice | no endpoint |
| Invoice | attachment on a sent invoice re‑sends? | "Add attachment" exists but the stored PDF/email is not regenerated |
| Multi‑currency recurring | fresh rate per occurrence | copies the parent rate (B17) |
| Email delivery status | | `module_emails.status` stays `pending`; no bounce / delivered info |
| Timezone | per‑business | `businesses.timezone` exists but sales jobs ignore it |

---

## 4. Improvements (code level)

1. One shared `money` validator (`lib/money.ts` + `utils/money.js`) with `MAX_MONEY`, `MAX_QTY`, 2‑decimal check, used by invoice, quote, product and credit‑note forms and controllers.
2. Turn on `STRICT_TRANS_TABLES` on all environments; add a CI check that rejects `sql_mode = ''`.
3. Make the recurring cron idempotent per schedule row: mark `processing_at` before cloning, use calendar arithmetic, seed from `schedule_date` not `now()`, and log per‑invoice failures to a table that the Sales Settings page can show.
4. Move "today" for every sales job to a `businessToday(business)` helper using `businesses.timezone`; the hourly `scheduleAtBusinessLocalHour` scheduler already exists for reminders — use it for recurring and future‑work too.
5. Replace `error.statusCode = 200` with proper 4xx codes and a stable `code` field (`PLAN_LIMIT`, `STOCK_SHORT`, `NUMBER_TAKEN`).
6. Country‑registry validation on the business write path (ABN mod‑89, NZBN, BSB, NZ account) so mobile and legacy clients cannot store bad bank details.
7. Advance `settings.next_invoice_no` on every create (locked), and replace the prefix scan in `getNextInvoiceNumber` with a single `MAX(CAST(SUBSTRING(invoice_no, len(prefix)+1) AS UNSIGNED))` query.
8. In `deleteInvoice`, release the originating quote and audit it.
9. Partial branding saves (dirty keys only) and an `updated_at` optimistic‑lock check.
10. A migration to normalise legacy `brandings.invoice_template` values and the 22 empty `mark_as` rows (SQL file for you to run).
11. Audit‑log → history: feed `audit_logs` events (edit, cash paid, undo, match, reminders) into `getInvoiceHistoryTimeline` so the dialog is complete without new tables.

---

## 5. UI / UX suggestions

### Invoices
- Cap and format money inputs live (`99,999,999.99` max) and show a thousands‑separated preview under the field.
- Put a "Sent to …" chip with the recipients (To / CC) on the row tooltip and in the history, so users can see who got the email.
- "Send again" instead of a disabled "Sent on …".
- Invoice number field: show `maxLength` counter and the allowed characters.
- Draft safety: autosave the draft to localStorage (keyed by business) or warn before navigation — currently the browser "unsaved changes" prompt is the only guard.
- In the preview, label demo data clearly ("No client selected — showing sample client") or block preview until a client is chosen.
- First‑invoice gate: show a checklist card ("Address ✓, Bank details ✗, ABN ✗") at the top of the editor instead of discovering it on Save.
- Follow‑up reminder: show the computed date ("Will email on 14 Dec") and disable "notify client" when the client has no email.
- Repeating invoice: show the next three run dates and say explicitly "Blank = repeats until you stop it".

### Invoice list
- Status filter should include "Unsent" (sent status with `sent_at` null) — those are easy to lose.
- Row "Mark as paid" should open the cash dialog with the date defaulted to today and a note field.
- Show the matched bank transaction amount, not only the description.
- Bulk: allow "Send reminder" and "Download" for multi‑select; disable the checkbox for drafts like quotes do.

### Quotes
- Expired quotes: one clear action, "Send again (extends expiry by N days)", with the new date shown before confirming.
- Convert dialog: let the user pick invoice date / payment terms instead of silently using the expiry date.
- Show "Accepted by client on … from IP/email" and the rejection reason inline on the row.
- Public respond page: show the business timezone and the exact local expiry time.

### Sales settings
- Numbering tab: show the **actual** next number (computed) with "Reset to …" rather than the stored setting.
- Add reminder day inputs; show a preview sentence ("We'll email the client 3 days before and 7 days after the due date").
- Styling tab: show the currently‑selected layout clearly, and warn when the stored id is legacy/unknown.
- Add ABN / NZBN / bank details read‑only summary with a link to Business details, since users look for "SBN" here.
- Save per tab and show "Saved 2 min ago" per tab.

### Products & services
- Show "Used on N invoices / quotes" and "Last used" per product; warn on delete.
- Allow weeks / months / years as quantity types to match invoice lines.
- Inline GST rate badge per product that matches the business country (10 % / 15 %).
- Make SKU unique per business and searchable in the invoice picker.

---

## Appendix — dev DB evidence (read‑only queries used)

```sql
SELECT @@global.sql_mode;                                             -- ''
SELECT MAX(total), MAX(sub_total) FROM invoices;                      -- 99999999.99 (clamped)
SELECT COUNT(*) FROM invoices WHERE mark_as = '';                     -- 22
SELECT LENGTH(bsb), COUNT(*) FROM businesses WHERE bsb<>'' GROUP BY 1; -- 2,3,4,5,7,9,10‑digit BSBs exist
SELECT COUNT(*) FROM quotes q WHERE q.invoice_id>0 AND NOT EXISTS
  (SELECT 1 FROM invoices i WHERE i.id=q.invoice_id AND i.deleted_at IS NULL); -- 19
SELECT COUNT(*) FROM notify_future_work WHERE deleted_at IS NULL AND parent_id=0
  AND notify_future_work_date < CURDATE();                             -- 1079 never sent
SELECT SUM(mark_as='draft' AND due_reminder_sent=1) FROM invoices;     -- 2 drafts emailed as overdue
SELECT invoice_template, COUNT(*) FROM brandings GROUP BY 1;           -- 'default', 'template-1', 'template-4'
```

---

# Second pass (14 Nov 2026, later) — deeper checks

Run as sequential, narrow audits. New bugs are numbered N‑x so they don't collide with B‑x above.

| # | Severity | Area | Bug |
|---|---|---|---|
| N‑11 | Critical | Security | Runtime preview renders any client id (cross‑tenant client data in the PDF) |
| N‑12 | High | Security | Attachment merge pulls other tenants' documents with the same numeric id into the emailed PDF |
| N‑14 | High | Security | NDIS quote layouts print line text unescaped (HTML injection in PDF) |
| N‑13 | High | Preview | Multi‑currency runtime preview multiplies line prices by the rate |
| N‑16 | High | Email | Emails use a different "show bank details" flag than the PDF |
| N‑19 | High | Email | "Sent on …" shown before/even if the email never went; failures invisible |
| N‑25 | High | Numbering | Invoice numbers not unique on dev (943 duplicate groups); migration skipped itself |
| N‑1 | Medium | Settings | Footer phone toggle hides the client's phone in 20 layouts |
| N‑2 | Medium | Settings | Footer phone stored with trunk 0, never printed as text |
| N‑4 | Medium | Settings | Quote editor prefills the invoice note; quote note missing on Style 2 + NDIS quotes |
| N‑7 | Medium | Settings | "Item descriptions" off removes the whole line‑item table |
| N‑8 | Medium | Gate | Address popup bypassed when only a country is saved |
| N‑9 | Medium | Numbering | Quote numbers can duplicate (no unique index, no lock) |
| N‑15 | Medium | Preview | 400 MB upload buffered before auth; no rate limit on invoice preview |
| N‑17 | Medium | Email | "BCC me" is per user, not per business |
| N‑18 | Medium | Email | Worker retry after a successful send emails the client twice |
| N‑23 | Medium | Creation | Negative payment terms / valid‑for days reach the server |
| N‑24 | Medium | Creation | API edit of a settled invoice resets a paid deposit schedule to pending |
| N‑27 | Medium | Creation | Extra discount unvalidated (negative adds money; oversize zeroes total, keeps GST) |
| N‑28 | Medium | NDIS | NDIS price caps never enforced |
| N‑29 | Medium | Quotes | Editing an accepted quote turns it into a draft; old client link stays valid |
| N‑3, N‑5, N‑6, N‑10, N‑20, N‑21, N‑22, N‑26 | Low | various | see sections 6–9 |

## 6. Do Sales Settings reach every PDF layout? (all 29 templates checked)

How it works: every render path (saved preview, runtime preview, PDF/email job, gallery) calls `templateFunction(data, brandingData, …)` in `sole-ocr/src/services/templates.js:529`. Invoice templates read toggles via `getInvoiceBrandingToggles` (`templates.js:2185`), quote templates via `getQuoteBrandingToggles` (`:2209`, correctly reading `quo_*`). A missing column defaults to **on**. General invoice/quote line tables come from `templates/helper/index.js:341/461`; NDIS layouts draw their own table.

Coverage matrix (✅ honoured, ❌ ignored, ⚠️ partial):

| Layout | Colours / logo | Customer name / business / address | Customer ABN | Your name / business / address | Your ABN‑NZBN | Item descriptions | GST column | Qty type | Note | Footer phone | Footer links | Bank details | BSB hidden for NZ | TAX INVOICE / INVOICE | Deposit rows |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Invoice Style 1, 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ N‑7 | ✅ | ✅ | ⚠️ N‑3 | ⚠️ N‑1/N‑2 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invoice Style 3, 4, 5 | ✅ | ✅ | ❌ never printed | ✅ | ✅ | ⚠️ N‑7 | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invoice Style 6 | ✅ | ✅ | ❌ | ✅ | ❌ never printed | ⚠️ N‑7 | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invoice Classic 1–4 | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ N‑7 | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invoice Fitrec | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ❌ always "INVOICE" | ❌ none |
| NDIS invoice 1–4 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ (hard‑coded GST text) | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quote Style 1 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | n/a | n/a | ✅ | ✅ |
| Quote Style 2 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ prints invoice note, never quote note | ⚠️ | ✅ | n/a | n/a | ✅ | ✅ |
| Quote Style 3, 4, 6 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ unescaped | ⚠️ | ✅ | n/a | n/a | ✅ | ✅ |
| Quote Style 5, Classic 1/3/4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | n/a | n/a | ✅ | ✅ |
| Quote Classic 2 | ✅ | ✅ | ✅ | ❌ always printed | ❌ always printed | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | n/a | n/a | ✅ | ✅ |
| NDIS quote 1–4 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ never quote note | ⚠️ | ✅ | ❌ always printed | ✅ | ✅ | ✅ |

### N‑1 — Footer "Phone number" toggle hides the **client's** phone (Medium)
- Files: `sole-ocr/src/services/templates.js:2191` and `:2215` (`showCustomerPhone: resolveBrandingToggle(brandingData?.phone_enabled)`); used in invoice‑1/5, classic‑1/3, fitrec, ndis‑1..4, quotes‑1/2/3/4/6, ndis quotes. Invoice‑2/3/4/6 and classic‑2/4 ignore it.
- Repro: Sales Settings → Footer → Phone off → preview Style 1 with a client that has a phone: the client's phone disappears. Switch to Style 2: it's back.
- Fix: set `showCustomerPhone: true` in both toggle builders (or add a real `inv_customer_phone` / `quo_customer_phone` column + UI toggle).

### N‑2 — Footer phone stored with the trunk 0 and never printed as text (Medium)
- Files: `sole-webapp/lib/sales-settings-api.ts:340` (`phone: countryCode + digitsOnly(value)`), `lib/sales-settings.ts:223 phoneError`; `sole-ocr/src/templates/helper/index.js:54-62` (icon with `href="tel:…"` only); `templates.js:849 generateSocialLinksHtml` (the text version) is dead code.
- Repro: type `0412 345 678` with `+61` → stored `+610412345678`. PDF shows only a phone icon linking to `tel:+610412345678` (invalid). The number is never visible on the PDF or in any email, and on reload the field shows `412 345 678`, so the stored `0` is invisible to the user.
- Fix: store E.164 via `parsePhoneNumberFromString(countryCode + value)?.number`; validate with `isValid()`; print `+61 412 345 678` next to the icon in `generateSocialMediaLinks`.
- Related: `normalizeMobileNumber` (`templates.js:191`) adds the leading `0` only for `+61`, so an NZ provider/client phone prints `211234567` instead of `021 123 4567`. Format with libphonenumber's `formatNational()`.

### N‑3 — Sales Settings invoice note prints twice (Low)
- Files: `sole-webapp/components/invoices/invoice-editor.tsx:754-765` prefills `draft.notes` with the Sales Settings note; every invoice template prints `invoices.notes` in the body **and** `brandings.invoice_note` in the footer (e.g. `invoice-1.js:842` and `:853`).
- Effect: new invoices show the note twice; the footer copy also changes retroactively on old invoices (read at render time). `invoices.custom_note` / `display_note` are stored but no template reads them (dead columns).
- Fix: either stop prefilling the body, or stop printing `invoice_note` in the footer.

### N‑4 — Quote editor prefills the **invoice** note; quote note missing on Style 2 and NDIS quotes (Medium)
- Files: `sole-webapp/components/quotes/quote-editor.tsx:167-169, 275` (uses `fetchInvoiceBranding().invoiceNote`; `quote_note` is never fetched); backend `quotes-2.js:634`, `ndis-1..4` quotes `:823` print `invoiceNote` (always empty on the PDF path) and never `quote_note`; `quotes-3/4/5/6` + classic quotes print `data.branding.quote_note` unescaped.
- Repro: Sales Settings → Quote note "Valid 30 days" → new quote: body shows the *invoice* note; PDF on Style 2 / NDIS shows no quote note at all.
- Fix: fetch `quote_note` for the quote editor; in every quote template print `escapeHtml(quoteNote)` once.

### N‑5 — ABN toggles have no effect in several layouts (Low)
- Customer ABN never printed: invoice Style 3, 4, 5, 6; quote Style 1, 2, 3, 4, 6. Provider ABN/NZBN never printed on invoice Style 6 (`invoice-6.js:434-520`) — a tax‑invoice requirement in AU. Quote Classic 2 (`classic-template-2.js:524-529`) prints your name/business/identifiers regardless of the `quo_sole_*` toggles.
- Fix: add the guarded blocks (`showCustomerAbn && data.participant?.abn`, `providerIdentifiers(data)`) to those files, or hide the toggles when such a layout is selected.


### N‑7 — "Item descriptions" off removes the whole line‑items table (Medium)
- Files: `invoice-1.js:687`, `invoice-2.js:623`, `invoice-3.js:431`, `invoice-4.js:437`, `invoice-5.js:614`, `invoice-6.js:572`, classic 1–4, fitrec `:828`, and all general quote templates: `showItemsDescription ? generateDynamicTableContent(...) : ''`.
- Repro: Sales Settings → Invoice fields → "Item descriptions" off → preview: totals but **no items**.
- Fix: keep the table and blank only the description cell; or rename the setting "Show line items".

### B21 extended — legacy layout ids give four different layouts per path
- `findInvoiceTemplate(Number("default"))` → `id = NaN` → runtime preview 404/500 for the ~220 legacy `brandings` rows (`default`, `template-1..6`), because the frontend always sends `template_id = String(brandings.invoice_template)`. Saved‑PDF preview throws in `getTemplateDetails`. Meanwhile the PDF/email job falls back to **Style 1** (`queues/workers/invoicePdfGenerate.js:196`), quote PDF to **Style 3** (`v2/quote.js:2177`), bank‑match receipt to **Classic 1** (`v2/bankTransaction.js:1937`), NDIS conversion to **NDIS 1** (`invoice.js:1226`).
- Fix: one `resolveLayoutId(value, type)` helper mapping `default|template-N` → ids, used at all six call sites, plus a data migration.

### Also found
- Gallery/Styling‑tab preview (`defaultTemplate.js:301-322`) fetches none of the field toggles or notes, so the Styling tab preview always shows everything on — it does not match the real PDF.
- `brandings.logo_filename` is written to local `uploads/logos` (`controllers/projectSettings.js:399-411`) and never read. The PDF logo actually comes from `documents(source_type='business')`, uploaded through the user‑update endpoint with the `x-business-id` header; without that header only `user_info.profile_pic` is updated and the PDF logo does not change.
- Emails (`src/emailTemplates/*`) only use logo + colours; footer phone/website/socials never reach any email.
- Seven different branding attribute lists exist across `templates.js:448/1727/2495`, `controllers/templates.js:656`, `quote.js:340/975`, `defaultTemplate.js:302` — a new column is easily forgotten. Build one `buildTemplateBranding(row, type)`.
- Quote templates 3/4/5/6 and classic print `data.branding.quote_note` **unescaped** (XSS/HTML breakage in the PDF); invoice templates escape correctly.

## 7. Numbering and first‑invoice gate (own checks)



### N‑9 — Quote numbers can duplicate under concurrency (Medium)
- DB index `quotes.quote_no` is non‑unique (verified in `information_schema`); `services/v2/quote.js:730 generateQuoteNumber` has no row lock (invoices use `LOCK.UPDATE` + a unique index).
- Fix: add `uniq_quotes_no_per_business (business_id, quote_no)` (migration) and lock the settings row.

### N‑10 — Unescaped prefix in the next‑number regex (Low)
- File: `sole-ocr/src/services/invoice/invoice.js:2208` builds `new RegExp('^' + prefix + '(\\d+)$', 'i')`. A legacy prefix with `.`, `+`, `(` (allowed by the backend, see §2.7) either matches wrong numbers or throws → 500 when opening the editor.
- Fix: escape the prefix or compute with `SUBSTRING`.

### Numbering 1 → 100 walk‑through (verified in code)
- Settings `INV-`, next `1` → first invoice `INV-1`; with next `001` → `INV-001`, `INV-002` … (padding = width typed in settings, `padStart`, never truncates, so `INV-100` follows `INV-099`).
- Custom number typed in the editor: checked live (`GET /invoice/invoice-no/check`, case‑insensitive, soft‑deleted included) and again on save; a deleted `INV-5` can never be reused (unique index counts soft‑deleted rows) and the sequence skips it.
- Because the editor always sends the number (B12), `settings.next_invoice_no` stays at `1`; the next number is found by scanning all `INV-%` rows. Quotes do advance the setting (`syncNextQuoteNo`).
- Prefix change in Settings to one already used starts at the first free number (server returns what it stored); a next‑number lower than one in use is refused with the next free number — both verified in `controllers/projectSettings.js:184-230`.
- Quotes have no bank/address gate at all (`quote-editor.tsx` never calls `hasRequiredBankFields` / `hasBusinessAddress`), yet NDIS quote layouts print bank details (N‑6).

## 8. Preview paths (data correctness) and email flow

How it works:
- **Invoice runtime preview** `POST /api/template/runtime-preview` (`routes/templates.js:83`): multer → `PrivateAuth` → `runTimePreview` (`controllers/templates.js:593`). Reads branding + the current `businesses` row + `getInvoiceContext(invoiceId, userId, client_id)` in parallel, reshapes the editor payload with `normalizeRuntimeInvoiceData` (`:1022`), merges `{...db, ...runtime}` (`:771-790`), uses `DEMO_PARTICIPANT` when no client, renders through the same `templateFunction`. Attachments = uploaded files + `documents` rows merged by `utils/pdf mergePdfs`.
- **Saved preview / PDF job / email** all go through `generateTemplatePdf` → `getInvoiceData` (`services/templates.js:1583`), scoped to the invoice's own business, so multi‑business is handled on that path.
- **Country context** is cached 60 s but invalidated on business save (`services/businesses.js:398`), so an edited ABN/bank detail is not stale. Branding, bank, logo and `show_bank_detail_invoice` are never cached.
- **Send path**: `createInvoice (send=1)` / `sendInvoiceToClient` / `sendExistingInvoice` / receipts → `generateAndSendInvoicePdf` → BullMQ `invoice-pdf-generate` (3 attempts) → worker renders, uploads to S3, emails. `mark_as='sent'` and `sent_at` are written **before** the job runs; only recurring children wait for the email.

Email matrix:

| Email | Trigger | To | CC | Owner copy | Reply‑To | Subject | Attachment |
|---|---|---|---|---|---|---|---|
| Invoice | create with send, "Send to client", recurring auto‑send | `client.email` (deleted clients included) | `module_emails.selected_contacts` minus client/owner | CC owner if `notification_setting.is_email` (user‑wide, see N‑17) | invoice email ∥ business email ∥ login | `Invoice from {business}` | `invoice_{no}.pdf` |
| Paid receipt | cash paid + auto receipt; manual "Send paid receipt" | client | none | BCC owner if notification on | owner | `Paid invoice receipt from …` | receipt PDF |
| Due reminder | comm cron `inv_before_days`; manual; notify‑future‑work (B3) | client (cron) / recipients[] (manual) | contacts (+ owner) | — | owner | `Reminder: Invoice Due Reminder` | stored `invoice_file_path` |
| Overdue | overdue cron (`due_reminder=1`), comm cron `inv_after_days` | client | contacts + owner | — | owner | `Overdue Reminder: …` | stored PDF |
| Quote | send / create with send | client | contacts (+ owner if quote BCC on) | — | quote email ∥ … | `Quote from …` | `quote_{no}.pdf`, accept/reject link (expiry B16) |
| Quote expiry reminder | comm cron `quo_before_days` | client | contacts + owner | — | owner | `Reminder: Quote Expiry Reminder` | stored quote PDF |
| Quote accepted / rejected | public respond | **owner** | — | — | none (from "Sole App") | `Quote {no} Accepted` | none |

All email templates escape parameters (`emailTemplates/documentEmail.js:44`); no HTML injection found in emails.

### N‑11 — Runtime preview renders any client by id (Critical, security)
- Files: `sole-ocr/src/controllers/templates.js:603` (`client_id` from body) → `services/templates.js:2429-2446` (`Client.findByPk`, `Contact.findOne({client_id})`, `Address.findOne`) with no user/tenant filter; same in `services/quote.js:664-690 getQuoteContext`. `invoiceId` is ownership‑checked (`:2366`); the client is not.
- Repro: log in as user A → `POST /api/template/runtime-preview` with user B's `client_id` → PDF shows B's client name, business, address, ABN, email, phone, NDIS number and plan manager.
- Fix: load the client with `buildOwnershipWhere({ id, user_id, parent_id: 0 }, scope)` and call `validateClient` in both runtime controllers.

### N‑12 — Attachment merge picks up other tenants' files with the same numeric id (High, security)
- Files: `controllers/templates.js:562` and `services/templates.js:987` (`SELECT … FROM documents WHERE source_id = :source_id`, no `source_type` / `user_id`); the second one feeds the **emailed** PDF.
- Repro: business id 12 has a logo document; any user's invoice id 12 → Send to client → the emailed PDF ends with that logo page (images become pages in `mergePdfs`).
- Fix: `AND source_type = 'invoice' AND user_id = :userId` in both queries and in the quote attachment loader.

### N‑13 — Multi‑currency runtime preview multiplies line prices by the rate (High)
- Files: `sole-webapp/lib/invoice-submit.ts:561-580` sends preview items without `price_currency` / `amount_currency`; `controllers/templates.js:1130-1165 resolveItemDisplayAmount` treats untagged items as base currency and multiplies by `exchange_rate`. The quote preview tags items (`lib/quote-submit.ts:244-249`) and is correct; the saved PDF is correct.
- Repro: USD client, rate 0.65, one line 100 → preview line shows US$65 while Subtotal/Total show US$100; saved PDF shows 100.
- Fix: add `price_currency / amount_currency / gst_amount_currency: currency` to preview items (as the quote payload does); backend should treat untagged items as document currency when `currency_code` is set.

### N‑14 — NDIS quote layouts print line text unescaped (High, security)
- Files: `templates/quote-templates/ndis-1.js:666-669` (`${item.item_support_no}`, `${item.description}`, `${item.claim_type}`), ndis‑2/3/4 same; `escapeQuoteRenderData` (`services/quote.js:156`) escapes notes/participant/provider but not `quote_item`. (Invoice NDIS templates and the general quote table do escape.)
- Repro: NDIS quote line description `<img src=x onerror=…>` → rendered by Puppeteer in the PDF (quote preview runs with `enforceAllowlist:false`).
- Fix: escape `quote_item[].description, item_support_no, claim_type, qty_type, date` in `escapeQuoteRenderData` and wrap the NDIS cells in `escapeHtml`.

### N‑15 — Preview buffers up to 400 MB of uploads before auth; no rate limit on invoice preview (Medium)
- Files: `routes/templates.js:17-24, 83` (`handleFiles` runs before `PrivateAuth`, 20 MB × 20 files, no limiter); no cap on `items.length` or description length; each preview opens a Chromium page.
- Fix: `PrivateAuth` before `handleFiles`; add `invoiceRenderLimiter`; cap `items.length` (200) and description (2,000 chars) on preview **and** `/invoice/add`.

### N‑16 — Emails read a different "show bank details" flag than the PDF (High)
- Files: `email.service.js:744-754 shouldShowBankDetails` → `payrix_account_maps.show_bank_details` (default true), used by invoice, reminder and overdue emails; the PDF uses `businesses.show_bank_detail_invoice` (`services/templates.js:150`).
- Repro: business turns "Show bank details" off → PDF hides them, but the invoice email body and every reminder still print BSB/account.
- Fix: use `resolveShowBankDetailsOnInvoice(userId, scope)` from `services/templates.js` in the email service.

### N‑17 — "BCC me" is per user, not per business (Medium)
- File: `email.service.js:575-594 isEmailNotificationEnabled` queries `notification_setting` by `user_id` only, although the table has `business_id` and the reminder cron scopes by it.
- Repro: AU + NZ businesses under one login, BCC on for AU only → NZ invoices/quotes/receipts also CC the owner.
- Fix: add `business_id` / `tenant_id` to the where clause.

### N‑18 — No idempotency in the PDF/email worker (Medium)
- Files: `queues/workers/invoicePdfGenerate.js:340-349` (`sgMail.send` then `DeliveryJobs.emailSent` inside the same try; any throw afterwards triggers a BullMQ retry, 3 attempts); `services/v2/quote.js:2340-2345` same.
- Effect: a failure after SendGrid accepted the mail (DB blip, S3 error, worker killed) re‑renders and re‑emails the client.
- Fix: check `document_delivery_jobs.email_status = 'sent'` before sending; record `emailSent` outside the throwing path; use a deterministic `jobId`.

### N‑19 — Invoice shows "Sent on …" before, and even if never, delivered (High)
- Files: `services/invoice/invoice.js:1082, :320, :6770` write `sent_at` right after queueing; worker `:420-433` only logs failures; `module_emails.status` never becomes `failed` for invoices (quotes do, `v2/quote.js:2360`); SendGrid 4xx (invalid contact email, stale client email) is permanent and not retried. Frontend `invoice-editor.tsx:1335-1339` toasts "INV‑1 sent" on API return; nothing reads `document_delivery_jobs`.
- Repro: client email `john@@example` (not validated server‑side) → Save & send → toast says sent, list says "Sent on …", the email never went.
- Fix: expose `document_delivery_jobs.email_status` on the invoice detail/list and show "Sending… / Failed — retry"; validate `invoice_email` and `selected_contacts[].email` server‑side before queueing; mark `module_emails.status='failed'` on permanent failure.

### N‑20 — Reminder PDFs carry a Stripe link that expires after 90 days (Low)
- Files: `utils/encrypt.js:232 signInvoicePayToken` (90‑day TTL) baked into the stored PDF (`invoicePdfGenerate.js:182-190`); reminders re‑attach that PDF with no fresh link.
- Fix: pass a fresh `buildPayLink(invoice)` into reminder emails or regenerate the PDF in the cron.

### N‑21 — New‑invoice preview prints a dead "Pay via Stripe/WorldPay" button (Low)
- Files: `controllers/templates.js:878-880` (pay link only when `invoiceId`), `invoice-templates/invoice-1.js:745-749` (button printed whenever `isStripe || isPayrix`, with `href=""`).
- Fix: guard the button with `payLink &&`.

### N‑22 — Bank match never sends the auto paid receipt (Low; corrects §2.5)
- File: `services/v2/bankTransaction.js:100-118 queueInvoicePdfUpload` uses `mailSend:false, receipt:false`; the only `receipt:true` call is cash‑paid (`invoice.js:5063`).
- Effect: "Auto paid receipt" only fires for Mark as paid with cash.
- Fix: after a settling match, mirror `invoice.js:5058-5066` when `send_paid_invoice_receipt` is on.

### Correction to §2.9 ("preview and final PDF share the same render")
True only for the saved preview. The editor's runtime preview is a separate data path: N‑13, N‑21, and `deposit_status` is always "requested" (runtime never sends `deposit_paid_amount`, `controllers/templates.js:1205`) while `payment_schedules` come from the DB row, so previewing an edited deposit shows the old schedule.

### Verified OK on the preview path
Per‑line GST, percent/amount discounts, extra discount, deposit modes, NDIS fields (support item, claim type, date, participant number, plan manager) reach the preview with the editor's numbers for base‑currency documents. Client block uses the real client + primary contact + address; business block (ABN/NZBN, address, BSB/account, show‑bank flag, logo) comes from current rows on every path; NZ hides BSB in PDF and emails. Quote preview matches the quote PDF (template id, deposit, expiry, notes). Overdue cron sets both "sent" flags so the communication cron doesn't double‑send.

### Also found
- `document_delivery_jobs` (status, recipients, SendGrid message id, error) is written on every send but never exposed to the frontend.
- `brandings.ndis_quote_template` is never used by the quote PDF job (`resolveQuoteTemplateId` → `quote_template` → 13).
- Pay‑link base URL defaults to `http://localhost:3001` in `controllers/templates.js:881, :337` and `invoicePdfGenerate.js:187`; the Payrix link AES key is hard‑coded at `controllers/templates.js:884`.
- Attachment / S3 names use `invoice_${invoice_no}.pdf` unsanitised (worker `:297`, overdue cron `:104`), so `INV/2024/01` creates S3 sub‑paths.
- Deleted clients (`Client` is `paranoid:false`, overdue cron also `paranoid:false`) keep receiving reminders.
- Runtime `getInvoiceContext` reads `invoice.base_currency` (`templates.js:2525`) but does not select it (`:2380-2402`).

### UI/UX
- Replace the immediate "INV‑1 sent" toast with "Sending to a@b.com…" and surface failures on the row (needs the N‑19 endpoint).
- Say in the preview that it uses the client's current details; hide the pay button until the invoice is saved.
- Warn in the editor when a selected contact has no or an invalid email (today it is silently dropped server‑side).

## 9. Creation / edit validation, first‑invoice popups, list conditions (agent 3 partial + own checks)

How the gate works: `invoice-editor.tsx:1124-1199` builds `issues` (document + number taken + NDIS + stock), then total / deposit / follow‑up / currency checks; `blocked` also folds in `missingAddress`, `missingBankDetails`, `claimIssue`. `save()` (`:1255`) opens the **address** dialog first, then **bank**, then **NDIS number**; only the NDIS dialog remembers which button was pressed (`ndisPendingMode`) — after saving address or bank details the user must press Save again. Both gates are skipped when the business query fails (`businessReady && !businessError`), by design, so an API hiccup lets an invoice go out without bank details. Quotes have no gate.

Field‑by‑field (frontend rule → backend rule):

| Field | Frontend | Backend | Gap |
|---|---|---|---|
| Client | required, must be picked from list | `validateClient` (business/tenant + user map) | OK |
| Invoice / quote number | required; live duplicate check | create: unique per business incl. soft‑deleted; edit: ignores soft‑deleted (N‑25) | no length/charset (B13) |
| Invoice date / due date | due picker `fromDate = issued` | `due >= invoice_date` (400) | terms input bypasses picker (N‑23) |
| Payment terms / Valid‑for days | free text, `Number()` | none (derived) | negative / huge accepted (N‑23) |
| Quote date / expiry | expiry picker `fromDate = issued` | **none** (`createQuote`/`updateQuote` only require presence) | expiry before quote date accepted via API (N‑26) |
| Line description | required when line is filled | required, non‑empty | 1024‑char column, no cap either side |
| Qty | ≥ 0, whole unless hours/km | `qty > 0` | 0 only caught server‑side for a described line; no max (B1) |
| Price | ≥ 0, 2 decimals | `price >= 0` | no max (B1); `0` price lines allowed both sides |
| Line discount | % ≤ 100, amount ≤ line | recomputed from `discount` + `disc_criteria`, no bounds | API can send > 100 % → negative line |
| Extra discount | plain input, no validation | `parseFloat ∥ 0`, total `Math.max(0, …)` | negative or oversize accepted (N‑27) |
| GST per line | hidden when business not registered | 422 when `gst` sent and not registered | OK |
| Deposit | percent < 100, amount < total, due date in range, items ≥ 2 | `validateInvoicePaymentScheduleInput` (value > 0, % < 100) | amount ≥ total not checked server‑side |
| Multicurrency rate | required > 0 when converting | `validateMultiCurrencyPayload`, staleness check | OK |
| Attachments | 5 files, 20 MB, png/jpeg/pdf | multer 10 files, 20 MB, **no type filter** | other types accepted via API |
| Recurring | occurrences integer ≥ 1 or blank; start default issued+1 | frequency + on_occurance enum; start date not validated | past start date, blank = unlimited (§2.3) |
| Follow‑up | days 1..terms, note required | `'me'∥'both'` only | OK |
| NDIS participant number | 9 digits | 9 digits | OK |
| NDIS support item / claim type / date | picked from catalogue; date required | stored as sent; `claim_type` enum enforced by the column (non‑strict → `''` on bad value) | price **cap never enforced** (N‑28) |
| Stock | qty ≤ on hand (+ what a sent invoice already holds) | `syncInvoiceStock` refuses on send | OK |

### N‑23 — Payment terms / "valid for" accept negatives and the server rejects the save (Medium)
- Files: `sole-webapp/components/invoices/invoice-editor.tsx:1725-1737` (terms input, no min), `components/quotes/quote-editor.tsx:962-975` (same pattern); `lib/invoices.ts:826 addDays` works with negatives; nothing in `blocked` checks `due < issued`; backend `controllers/invoice.js:576-581` → 400.
- Repro: Payment terms `-5` → due date moves before the invoice date → Save → backend toast "Due date must be greater than or equal to invoice date". Same for a quote with `Valid for -5` (server does not even check, see N‑26).
- Fix: reject `< 0` / non‑integer in `onChange`, cap at 365, and add a `dueDateIssue` to `issues`.

### N‑24 — Backend lets a paid / partially paid invoice be edited; paid deposit schedule is reset to pending (Medium)
- Files: `sole-ocr/src/services/invoice/invoice.js:1511-1525` (`isSettled` only compares total, GST and client), `:1595-1611` (`replaceInvoicePaymentSchedules` destroys all schedules and recreates them as `pending`), `:1592` (lines replaced, stock moved).
- Repro: deposit invoice, deposit paid (bank match → `partially_paid`) → `POST /invoice/edit` from mobile/API with the same total → the paid deposit row is now `pending`, items can be swapped.
- Fix: when settled, 409 unless only notes/description changed; never destroy a schedule row with `status='paid'`.

### N‑25 — Invoice numbers are **not** unique on dev; migration 0133 skipped itself (High)
- Verified: `information_schema` shows only a non‑unique `invoice_no` index; `migrations/0133` deliberately skips the constraint when duplicates exist and leaves a row in `migration_manual_followups` (1 row present). Dev has **943 duplicate groups / 2,432 live invoices**, e.g. business 19732 has `inv-2` ×69 created within two seconds on 21 May 2026 (a retry storm before the row lock existed). The 409 "number just taken" handler in `createInvoice` is therefore dead code, and `updateInvoice` (`invoice.js:1476-1495`) adds `deleted_at: null` to its check, so renaming an invoice to a soft‑deleted number succeeds while creating with it is refused.
- Fix: clean the duplicates (renumber or void with a credit note), re‑run 0133, make the edit path use the same rule as create, and add the equivalent index for quotes (N‑9).

### N‑26 — Quote expiry before quote date accepted by the API (Low)
- Files: `services/v2/quote.js:1040` and `:1300` only check presence of `quote_date` / `valid_till`.
- Fix: `if (dayjs(valid_till).isBefore(quote_date)) throw 400`.

### N‑27 — Extra discount is unvalidated: negative adds money, oversize zeroes the total but keeps GST (Medium)
- Files: `sole-webapp/components/documents/totals-panel.tsx:80-87` (plain `PrefixInput`), `lib/invoices.ts:891 invoiceTotals` (`Math.max(0, sub − disc − extra + gst)`); backend `recalculateInvoiceTotals` (`invoice.js:630-650`) same formula, `extra_discount: parseFloat(...) || 0`, no bounds; `assertClientTotalsMatch` passes because both sides agree.
- Repro 1: extra discount `-50` → total goes **up** by 50 and is saved. Repro 2: extra discount larger than the subtotal → Total $0.00 while GST still shows (and is stored) → a $0 invoice with GST payable.
- Fix: validate `0 ≤ extra ≤ subtotal − lineDiscounts` on both sides and derive GST after the extra discount, or disallow extra discount when it exceeds the net.

### N‑28 — NDIS price caps are not enforced anywhere (Medium)
- Files: `components/documents/ndis-price-tier.tsx` only offers the National / Remote / Very remote prices and lets the user "type over the price"; `lib/ndis-support-items.ts` has no cap check; backend `utils/invoice.mapper.js` / `services/v2/quote.js` never compare `price` with `services_ndis.price_*`.
- Effect: a support can be billed above the NDIS Pricing Arrangements limit; the NDIA/plan manager rejects the claim, which is exactly what an NDIS template is meant to prevent.
- Fix: warn in the editor when `price > tier price` and block on the backend (or require an explicit "over cap" acknowledgement).

### N‑29 — Editing an accepted quote silently turns it back into a draft (Medium)
- File: `services/v2/quote.js:1366` `markAs = send===1||send===2 || quote.mark_as==='sent' ? 'sent' : 'draft'` — any other status (accepted, rejected) becomes `draft` on a plain save; `accepted_at` / `client_responded_at` are kept, so the history shows "accepted" on a draft. Frontend only blocks Edit when `convertedInvoice` is set (`quotes-table.tsx:838`), so an accepted‑not‑converted quote (B10 path) is editable.
- Also: saving an edited **sent** quote keeps the old response token (`:1411-1412`), so the client's existing link now accepts totals they never saw in the emailed PDF.
- Fix: keep `mark_as` unless explicitly sending; block Edit on accepted/rejected in the UI with "Duplicate instead"; invalidate the token on any money change.

### List conditions vs backend (final check)
- Invoices: every UI gate has a matching or stricter backend rule (§2.2). Bulk actions: the UI has no bulk delete / bulk mark‑paid (the button is a "coming soon" toast, `invoices-table.tsx:525-545`), while `POST /invoice/bulk-delete` exists and correctly refuses settled invoices.
- Quotes: UI allows Edit on accepted/rejected (N‑29) and Delete on any status (§2.6); backend `updateQuote` has no status guard and `destroyQuote` none. Convert on expired (B9) remains the one UI‑allows / backend‑refuses mismatch.
- Status tabs: invoice tabs come from `status-counts` (draft/sent/paid/partially paid + overdue derived from the browser date, so a row can flip between Outstanding and Overdue at midnight local while the server counts use UTC). Quote tabs cover draft/sent/saved/expired/accepted/declined/converted; a `rejected` quote with `converted=1` appears only under Converted.
- 22 invoices with `mark_as=''` (B24) appear in "All" but in no status tab.

### Popup edge cases
- Address dialog: `hasBusinessAddress` passes on country alone (N‑8); city/state/postcode optional for AU (postcode only validated when present).
- Bank dialog: saves the **whole** business draft seeded from the cached `["business", id]` query, so a field edited elsewhere after that cache loaded is overwritten with the stale value (`updateBusinessApi` sends every field, `lib/businesses.ts:660-700`).
- NZ: dialog shows one "Account number" field with the `BB-bbbb-AAAAAAA-SSS` hint; backend accepts anything (B11).
- Cancel on either dialog just closes it; the pending Save is dropped without a message.

## 10. Quick pass — Sales Settings save paths (code only)

### N‑30 — "BCC me on invoice/quote emails" also switches push notifications on/off (Medium)
- Files: `sole-webapp/lib/sales-settings-api.ts:467-479 saveNotificationPreferenceApi` sends `is_email` **and** `is_push_notification` with the same value; backend `sole-ocr/src/controllers/communicationPreference.js:125-147` writes both columns.
- Repro: Communication tab → turn off "BCC me on invoice emails" → Save. `notification_setting.is_push_notification` for module `invoice` becomes 0, so the user stops getting invoice push notifications on mobile.
- Fix: send only `is_email` from the web (the controller already keeps the other column when it is undefined).

### N‑31 — Saving the Communication tab resets reminder days to 1 (Medium)
- Files: `sales-settings-screen.tsx:172-181` saves all three reminders on every Save (`Promise.all`), each via `saveReminderPreferenceApi(type, enabled)` which always sends `days: 1` (`sales-settings-api.ts:498-513`); backend `communicationPreference.js:90-95` stores `parseInt(days)` unconditionally when `status === 'on'`.
- Repro: reminder set to 7 days from the mobile app (or old web) → open web Sales Settings → change any switch on the tab → Save → `inv_before_days` is now 1. No bounds check server‑side either (`-5` or `abc` → NaN → stored as null = off).
- Fix: add the days inputs (B20), send only the switches that changed, and validate `1 ≤ days ≤ 60` in the controller.

### N‑32 — Styling tab can store a non‑numeric layout id (Low)
- Files: `lib/sales-settings.ts:329-330` defaults `invoiceStyle: "general-01"`, `quoteStyle: "quote-general-01"`; `saveBrandingApi` sends `values.invoiceStyle || 1` (`sales-settings-api.ts:344`). If the branding fetch failed (the `Promise.allSettled` in `fetchSalesSettings` swallows it) and the user saves any tab, `brandings.invoice_template = "general-01"` is written — the same broken state as B21.
- Fix: never send `invoice_template` / `quote_template` unless the value is a numeric id that came from the server; block saving when the branding fetch failed.

### Verified OK in this pass
- Numbering tab: prefix/next‑number validation and server round‑trip (§7).
- Quote payload sends `quote_no`, `valid_till`, `template_id`, `selected_contact`, `save`/`send` consistently with the invoice payload.
- Invoice and quote lists invalidate their queries after send / mark paid / delete (7 invalidation points), so rows refresh without a reload.
