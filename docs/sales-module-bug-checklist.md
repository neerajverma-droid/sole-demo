# Sales Module — Bug Review Checklist

Date: 15 Nov 2026 · Branch `dev` · Frontend `sole-webapp`, backend `sole-ocr`, dev DB `soleAppDev`
Source: `docs/sales-module-audit-2026-11-14.md` (full detail). This file is the short version: one entry per bug, in plain words, so each one can be tested by hand.

How to use: test each bug, tick Pass/Fail, add a note. Severity: Critical = wrong money / wrong recipient / data leak · High = feature broken · Medium = wrong in an edge case · Low = polish.

Totals: 59 bugs — 6 Critical, 15 High, 28 Medium, 10 Low.

---

## A. Invoice — creating and editing

### B1 · Critical · Amounts have no upper limit, database silently clamps
- Where: `sole-webapp/lib/invoices.ts` (lineItemErrors), `sole-ocr/src/controllers/invoice.js` (createInvoice), DB columns `double(10,2)`
- Test: New invoice → price `100000000000000000` → Save.
- Expected: field error "Price can't exceed 99,999,999.99".
- Actual: saves; stored price/total become 99,999,999.99; PDF shows a different figure than typed.
- Fix: cap price/qty/total on both sides; later move DB to strict mode + DECIMAL(14,2).
- [ ] Pass  [ ] Fail  Note: ______

### B13 · Medium · Invoice number has no length / character limit
- Where: `invoice-editor.tsx` number input; `invoices.invoice_no varchar(30)`
- Test: edit number, type 40 characters, save.
- Expected: error at 30 chars.
- Actual: silently cut to 30 chars; list shows a number you never typed.
- Fix: `maxLength=30` + allowed charset on both sides.
- [ ] Pass  [ ] Fail  Note: ______

### B23 · Medium · Plan-limit error returned as HTTP 200
- Where: `sole-ocr/src/services/invoice/invoice.js:855`, `services/v2/quote.js:1091`
- Test: account at its monthly invoice limit → create invoice → check network tab.
- Expected: 402/403 with `success:false`.
- Actual: 200 with `success:false`.
- [ ] Pass  [ ] Fail  Note: ______

### B24 · Medium · 22 invoices with empty status on dev
- Where: DB `invoices.mark_as = ''`
- Test: `SELECT COUNT(*) FROM invoices WHERE mark_as=''`.
- Expected: 0. Actual: 22 (invalid enum written in non-strict mode); they show in "All" but no status tab.
- Fix: validate `mark_as` before write; data fix to `draft`.
- [ ] Pass  [ ] Fail  Note: ______

### B11 · High · Bank details popup accepts wrong BSB / account lengths; backend never validates
- Where: `components/invoices/add-bank-details-dialog.tsx` (maxLength 20 / 50), `sole-ocr/src/services/businesses.js updateBusiness` (no validation)
- Test: AU business → bank popup → BSB `12345678` → the field accepts it. Save via API/mobile with BSB `12`.
- Expected: input capped at 6 digits; server rejects bad BSB / account / NZ account format.
- Actual: dev DB has BSBs of 2–10 digits and account numbers up to 36 chars.
- [ ] Pass  [ ] Fail  Note: ______

### B27 · Low · Address popup has no limits
- Where: `add-address-dialog.tsx`
- Test: paste 2,000 chars into Address line 1; type free text in State.
- Expected: max lengths; State as a dropdown.
- [ ] Pass  [ ] Fail  Note: ______

### N-8 · Medium · Address popup can be skipped
- Where: `lib/businesses.ts hasBusinessAddress`
- Test: business with only `country` saved, no street → new invoice → Save.
- Expected: "Add your business address" popup.
- Actual: no popup, invoice goes out with no address.
- Fix: require street (and postcode for AU/NZ).
- [ ] Pass  [ ] Fail  Note: ______

### N-23 · Medium · Negative payment terms / "valid for" days reach the server
- Where: `invoice-editor.tsx` terms input, `quote-editor.tsx` valid-for input
- Test: Payment terms `-5` → Save.
- Expected: field error.
- Actual: due date moves before the invoice date; server rejects with a toast. For quotes the server does not even check (N-26).
- [ ] Pass  [ ] Fail  Note: ______

### N-27 · Medium · Extra discount is not validated
- Where: `components/documents/totals-panel.tsx`, `lib/invoices.ts invoiceTotals`, backend `recalculateInvoiceTotals`
- Test 1: Extra discount `-50` → total goes **up** by 50 and saves.
- Test 2: Extra discount bigger than subtotal → Total $0.00 but GST still shown and stored.
- Expected: 0 ≤ extra ≤ net; GST recomputed.
- [ ] Pass  [ ] Fail  Note: ______

### N-24 · Medium · API can edit a paid / partially paid invoice and reset the paid deposit
- Where: `sole-ocr/src/services/invoice/invoice.js:1511-1611`
- Test: deposit invoice with deposit paid → `POST /invoice/edit` (mobile or API) with same total.
- Expected: 409.
- Actual: paid deposit schedule row recreated as `pending`; items/dates can change.
- [ ] Pass  [ ] Fail  Note: ______

### N-28 · Medium · NDIS price caps never enforced
- Where: `components/documents/ndis-price-tier.tsx`, backend mapper
- Test: NDIS invoice line → type a price above the National price → Save.
- Expected: warning / block.
- Actual: saved; NDIA will reject the claim.
- [ ] Pass  [ ] Fail  Note: ______

### N-10 · Low · Legacy prefix with regex characters breaks "next number"
- Where: `invoice.js:2208 getNextInvoiceNumber`
- Test: settings prefix `INV(` (via API/old app) → open new invoice.
- Expected: next number shown. Actual: 500.
- [ ] Pass  [ ] Fail  Note: ______

## B. Invoice — list and actions

### B25 · Low · No way to resend the invoice email
- Where: `invoices-table.tsx:1104-1116`
- Test: sent invoice → row menu → "Send to client".
- Expected: "Send again". Actual: disabled "Sent on …"; only "Send reminder" works.
- [ ] Pass  [ ] Fail  Note: ______

### N-19 · High · Invoice shows "Sent on …" before (or even if never) delivered
- Where: `invoice.js:1082/320/6770` (sent_at written on queue), worker only logs failures; no server email validation
- Test: client email `john@@example` → Save & send.
- Expected: "Sending…" then "Failed — retry".
- Actual: toast "INV-1 sent", list says "Sent on …", email never went.
- [ ] Pass  [ ] Fail  Note: ______

### N-25 · High · Invoice numbers are not unique on dev
- Where: no unique index (migration 0133 skipped itself); `updateInvoice` ignores soft-deleted numbers
- Test: `SELECT business_id, invoice_no, COUNT(*) FROM invoices WHERE parent_id=0 AND deleted_at IS NULL GROUP BY 1,2 HAVING COUNT(*)>1` → 943 groups. Also: delete INV-5, then rename INV-9 to INV-5 → succeeds; creating INV-5 is refused.
- Fix: clean duplicates, re-run migration 0133, same rule on create and edit.
- [ ] Pass  [ ] Fail  Note: ______

### B12 · High · Next invoice number in Sales Settings never advances
- Where: `lib/invoice-submit.ts` always sends `invoice_no`; `generateInvoiceNumber` skips the counter for custom numbers
- Test: create 5 invoices → Sales Settings → "Invoice next number".
- Expected: 6. Actual: still 1 (number is found by scanning all invoices each time).
- [ ] Pass  [ ] Fail  Note: ______

## C. Recurring invoices

### B5 · High · Editing a recurring invoice restarts the series → duplicate invoices
- Where: `invoice.js:2047-2050 handleRecurringInvoiceUpdate` (Date vs string and string vs number comparisons are always "changed")
- Test: monthly recurring, 12 occurrences, let 3 run → edit parent description → next midnight.
- Expected: nothing changes. Actual: all schedules wiped, series restarts from the original start date, extra invoice generated.
- [ ] Pass  [ ] Fail  Note: ______

### B6 · High · Daily cron crashes for recurring invoices without extra contacts
- Where: `recurringInvoice.js:528-531` (`module_email_data.selected_contacts` on null)
- Test: recurring invoice created with no CC contacts → wait for cron (or run `processRecurringInvoices`).
- Expected: child invoice created. Actual: TypeError, skipped every day (4 overdue schedules on dev, oldest 2 Sep).
- [ ] Pass  [ ] Fail  Note: ______

### B7 · High · Monthly / quarterly / yearly dates drift
- Where: `recurringInvoice.js:22-37` (30 / 90 / 365 days)
- Test: monthly from 31 Jan → dates 2 Mar, 1 Apr, 1 May…
- Expected: same day each month.
- [ ] Pass  [ ] Fail  Note: ______

### B17 · Medium · Child invoice is an incomplete copy
- Where: `recurringInvoice.js:214-262`
- Test: recurring invoice with Stripe on, attachments, USD client → check the generated child.
- Expected: same pay link, attachments, fresh exchange rate, invoice email.
- Actual: no pay link, no attachments, old rate, reply-to falls back to profile email.
- [ ] Pass  [ ] Fail  Note: ______

### B18 · Medium · Hard-coded catch-up date 2026-06-10
- Where: `recurringInvoice.js:443`
- Test: schedule dated before 10 Jun 2026 → never processed.
- [ ] Pass  [ ] Fail  Note: ______

## D. Follow-up reminder (notify future work) and automatic reminders

### B3 · Critical · Client gets a payment reminder instead of the follow-up message
- Where: `recurringInvoice.js:695-735` → `sendReminderEmail` with template `invoice_reminder`
- Test: invoice with follow-up note "Time for your annual service", notify client → on the date, check the email.
- Expected: the note. Actual: "Reminder: Future Work Reminder" asking to pay the invoice, with PDF and bank details; note absent.
- [ ] Pass  [ ] Fail  Note: ______

### B19 · Medium · Follow-up fires only on the exact day (UTC), no catch-up
- Where: `recurringInvoice.js:746-750`
- Test: `SELECT COUNT(*) FROM notify_future_work WHERE deleted_at IS NULL AND notify_future_work_date < CURDATE()` → 1,079 never sent.
- [ ] Pass  [ ] Fail  Note: ______

### B2 · Critical · Overdue reminder emails **draft** invoices to clients
- Where: `overdueInvoiceCron.js:11-19` (no `mark_as != draft`)
- Test: draft invoice, overdue reminder on, due date in the past → next cron.
- Expected: nothing sent. Actual: client receives an overdue email for an invoice they never got (2 cases on dev).
- [ ] Pass  [ ] Fail  Note: ______

### B20 · Medium · Reminder days hard-coded to 1 / N-31 · Medium · Saving the Communication tab resets days to 1
- Where: `lib/sales-settings-api.ts:498`, `sales-settings-screen.tsx:172-181`, backend `communicationPreference.js:90-95` (no bounds)
- Test: set reminder to 7 days from mobile → web Communication tab → change any switch → Save.
- Expected: 7 stays. Actual: becomes 1. No days input exists on the web.
- [ ] Pass  [ ] Fail  Note: ______

### N-30 · Medium · "BCC me" switch also toggles push notifications
- Where: `sales-settings-api.ts saveNotificationPreferenceApi` sends `is_push_notification`
- Test: turn off "BCC me on invoice emails" → check `notification_setting.is_push_notification` for module invoice.
- Expected: unchanged. Actual: 0.
- [ ] Pass  [ ] Fail  Note: ______

### N-17 · Medium · "BCC me" is per user, not per business
- Where: `email.service.js:575-594`
- Test: AU + NZ business, BCC on for AU only → send an NZ invoice.
- Expected: no owner copy. Actual: owner CC'd.
- [ ] Pass  [ ] Fail  Note: ______

### N-22 · Low · Bank match never sends the auto paid receipt
- Where: `v2/bankTransaction.js:100-118`
- Test: auto receipt on → match a bank payment to an invoice.
- Expected: receipt email. Actual: only "Mark as paid with cash" sends one.
- [ ] Pass  [ ] Fail  Note: ______

### N-20 · Low · Reminder PDFs carry a Stripe link that expires after 90 days
- Where: `utils/encrypt.js:232`, reminders re-attach the stored PDF
- [ ] Pass  [ ] Fail  Note: ______

## E. Quotes

### B8 · High · Deleting the invoice leaves the quote locked as "converted"
- Where: `invoice.js:6454 deleteInvoice` never updates the quote
- Test: convert quote → delete that invoice → quote row.
- Expected: quote convertible/editable again. Actual: "Already converted to INV-x" forever (19 rows on dev).
- [ ] Pass  [ ] Fail  Note: ______

### B9 · High · UI offers "Convert to invoice" on expired quotes, server refuses
- Where: `quotes-table.tsx:827-831` vs `invoice.js:1176-1181`
- Test: expired quote → Convert.
- Expected: either allowed or a disabled item with a reason. Actual: server error toast. (1,255 of 1,272 sent quotes on dev are expired.)
- [ ] Pass  [ ] Fail  Note: ______

### B10 · High · Owner not notified if invoice creation fails after client accepts
- Where: `services/v2/quote.js:2553-2705`
- Test: user at invoice plan limit → client clicks Accept.
- Expected: quote accepted, owner emailed with the reason. Actual: client sees an error; quote is accepted; no owner email/notification.
- [ ] Pass  [ ] Fail  Note: ______

### B14 · Medium · Converted invoice due date = quote expiry (or deposit date)
- Where: `invoice.js:1185`, `v2/quote.js:2440`
- Test: quote valid 30 days, accept on day 28 → invoice due in 2 days.
- [ ] Pass  [ ] Fail  Note: ______

### B15 · Medium · Client-accepted NDIS quote uses the general invoice layout
- Where: `v2/quote.js:2441`
- [ ] Pass  [ ] Fail  Note: ______

### B16 · Medium · Quote expiry computed in UTC and inconsistently
- Where: `v2/quote.js:72, 565, 590`, `services/quote.js:47-66`
- Test: NZ quote valid till 20 Nov → on 20 Nov 1 pm NZDT the client link says expired; list showed "Expired" all day; "Send again" allowed.
- [ ] Pass  [ ] Fail  Note: ______

### N-9 · Medium · Quote numbers can duplicate
- Where: non-unique `quotes.quote_no` index; `generateQuoteNumber` has no lock
- Test: two quote creates at the same moment.
- [ ] Pass  [ ] Fail  Note: ______

### N-26 · Low · Quote expiry before quote date accepted by API
- Where: `v2/quote.js:1040, 1300`
- [ ] Pass  [ ] Fail  Note: ______

### N-29 · Medium · Editing an accepted quote turns it into a draft; old client link stays valid
- Where: `v2/quote.js:1366, 1411`
- Test: accepted (not converted) quote → Edit → Save. Status becomes Draft, `accepted_at` kept. Edit a sent quote's total → client's existing link still accepts the new total.
- [ ] Pass  [ ] Fail  Note: ______

## F. Sales Settings → templates and preview

### N-1 · Medium · Footer "Phone number" toggle hides the **client's** phone
- Where: `services/templates.js:2191, 2215`
- Test: Footer tab → Phone off → preview Style 1 with a client that has a phone → client phone gone; Style 2 → back.
- [ ] Pass  [ ] Fail  Note: ______

### N-2 · Medium · Footer phone stored with leading 0, never printed as text
- Where: `lib/sales-settings-api.ts:340`, `templates/helper/index.js:54-62`
- Test: type `0412 345 678` (+61) → DB `+610412345678`; PDF shows only a phone icon linking to an invalid number. NZ numbers print without their leading 0.
- Expected: `+61 412 345 678` printed next to the icon.
- [ ] Pass  [ ] Fail  Note: ______

### N-3 · Low · Invoice note prints twice
- Where: `invoice-editor.tsx:754-765` prefill + footer `invoice_note`
- Test: Sales Settings note "Thanks" → new invoice preview → note in body and footer.
- [ ] Pass  [ ] Fail  Note: ______

### N-4 · Medium · Quote editor prefills the *invoice* note; quote note missing on Style 2 and NDIS quotes
- Where: `quote-editor.tsx:167-169, 275`; `quotes-2.js:634`; NDIS quote templates `:823`
- Test: Sales Settings → Quote note "Valid 30 days" → new quote → body shows the invoice note; PDF Style 2 / NDIS shows no quote note.
- [ ] Pass  [ ] Fail  Note: ______

### N-5 · Low · ABN toggles have no effect in several layouts
- Customer ABN never printed: invoice Styles 3–6, quote Styles 1–4, 6. Your ABN never printed on invoice Style 6. Quote Classic 2 ignores "your details" toggles.
- Test: toggle Customer ABN on → preview Style 3 → no ABN.
- [ ] Pass  [ ] Fail  Note: ______

### N-6 · Low · NDIS layouts ignore GST / description toggles; NDIS quotes always print bank details
- Where: `ndis-1..4` templates; `services/quote.js:1074`
- [ ] Pass  [ ] Fail  Note: ______

### N-7 · Medium · "Item descriptions" off removes the whole line-item table
- Where: `invoice-1.js:687` and all general layouts
- Test: Invoice fields → Item descriptions off → preview → totals, no items.
- [ ] Pass  [ ] Fail  Note: ______

### B21 · Medium · Legacy layout ids (`default`, `template-1`) break preview; PDF/email fall back to different layouts
- Where: `controllers/templates.js:525 findInvoiceTemplate(Number(id))`; fallbacks in PDF job (Style 1), quote PDF (Style 3), receipt (Classic 1), NDIS conversion (NDIS 1)
- Test: `SELECT invoice_template, COUNT(*) FROM brandings GROUP BY 1` → `default` ×141, `template-1` ×47… For such a user: Preview fails; emailed PDF uses Style 1.
- Fix: one `resolveLayoutId()` helper + data migration.
- [ ] Pass  [ ] Fail  Note: ______

### N-32 · Low · Styling tab can store a non-numeric layout id
- Where: `lib/sales-settings.ts:329` default `general-01`, saved when the branding fetch failed.
- [ ] Pass  [ ] Fail  Note: ______

### B22 · Medium · Settings tabs overwrite each other
- Where: `saveBrandingApi` sends the full record
- Test: two browser tabs → change colour in A, save → change footer link in B, save → colour reverts.
- [ ] Pass  [ ] Fail  Note: ______

### Also (no test needed, for the backlog)
- Styling-tab preview ignores field toggles and notes, so it never matches the real PDF.
- `brandings.logo_filename` is written but never read; PDF logo comes from the business document upload.
- Footer phone/website/socials never appear in any email.
- Seven different branding attribute lists in the backend; one shared builder needed.

## G. Preview and email flow

### N-11 · Critical · Runtime preview shows any client by id (data leak)
- Where: `controllers/templates.js:603` → `services/templates.js:2429-2446`; same in `services/quote.js:664-690`
- Test: as user A, `POST /api/template/runtime-preview` with user B's `client_id`.
- Expected: 403. Actual: PDF with B's client name, address, ABN, email, phone, NDIS number.
- [ ] Pass  [ ] Fail  Note: ______

### N-12 · High · Attachment merge pulls other tenants' files with the same numeric id
- Where: `controllers/templates.js:562`, `services/templates.js:987` (`WHERE source_id = N`, no type/owner filter)
- Test: business id 12 has a logo document → any user's invoice id 12 → Send → emailed PDF ends with that logo page.
- [ ] Pass  [ ] Fail  Note: ______

### N-14 · High · NDIS quote layouts print line text unescaped
- Where: `quote-templates/ndis-1..4.js:666-669`
- Test: NDIS quote line description `<img src=x onerror=alert(1)>` → preview PDF renders HTML.
- [ ] Pass  [ ] Fail  Note: ______

### N-13 · High · Multi-currency live preview multiplies line prices by the rate
- Where: `lib/invoice-submit.ts:561-580` (items not tagged with currency), `controllers/templates.js:1130-1165`
- Test: USD client, rate 0.65, one line 100 → Preview → line shows US$65, totals US$100. Saved PDF shows 100.
- [ ] Pass  [ ] Fail  Note: ______

### N-16 · High · Emails use a different "show bank details" flag than the PDF
- Where: `email.service.js:744-754` reads `payrix_account_maps.show_bank_details`; PDF reads `businesses.show_bank_detail_invoice`
- Test: Show bank details off → send invoice → PDF hides them, email body shows BSB/account.
- [ ] Pass  [ ] Fail  Note: ______

### N-18 · Medium · Worker retry after a successful send emails the client twice
- Where: `queues/workers/invoicePdfGenerate.js:340-349`
- [ ] Pass  [ ] Fail  Note: ______

### N-15 · Medium · Preview buffers 400 MB uploads before auth; no rate limit on invoice preview
- Where: `routes/templates.js:17-24, 83`
- [ ] Pass  [ ] Fail  Note: ______

### N-21 · Low · New-invoice preview prints a dead "Pay via Stripe" button
- Where: `controllers/templates.js:878-880`, `invoice-1.js:745-749`
- Test: Stripe on → Preview an unsaved invoice → button with empty link.
- [ ] Pass  [ ] Fail  Note: ______

### B4 · Critical · Unauthenticated default-preview endpoint
- Where: `routes/defaultInvoice.js:6` (no PrivateAuth), `controllers/defaultInvoice.js:9`
- Test: logged out, `GET /api/invoice-default/preview?useDemo=false&userId=<any>&invoiceId=<any>`.
- Expected: 401. Actual: HTML with that user's business name, ABN, bank details, logo.
- [ ] Pass  [ ] Fail  Note: ______

## H. Products & services

### B26 · Low · Product model mismatch, no price cap
- Where: `controllers/customProductService.js:127` (qty types items/hours/days/km only), prices unvalidated, SKU not unique
- Test: product selling price `999999999999` → saved as 99,999,999.99; create two products with the same SKU → allowed.
- [ ] Pass  [ ] Fail  Note: ______

## I. Missing features (no backend / no UI) — for the backlog, not for testing
- Reminder days input on the web (B20); quote "Item descriptions" toggle, "Do nothing" acceptance option and credit-note numbering are local-only state.
- Invoice history lacks: edit, cash paid / undo, bank match / unmatch, automatic reminders, follow-up reminder, recurring child created, email delivery status, viewed.
- Resend invoice email; recurring schedule view (next run dates, generated children); pause/skip one occurrence.
- Product "used in N invoices"; email delivery status (`document_delivery_jobs` exists but is never exposed).
- Per-business timezone for all date-based jobs (`businesses.timezone` exists but is ignored).

## J. Top UI/UX suggestions
- Cap and format money inputs live; show thousands separators.
- "Send again" instead of a disabled "Sent on …"; show To/CC recipients in the row tooltip and history.
- First-invoice checklist card (Address ✓ Bank ✗ ABN ✗) at the top of the editor instead of discovering it on Save.
- Repeating invoice: show the next three run dates; say "Blank = repeats until you stop it".
- Quotes: one clear "Send again (extends expiry by N days)" action; convert dialog lets the user pick due date / terms.
- Sales Settings: show the real next number; add reminder day inputs; hide toggles a layout cannot honour; read-only ABN/bank summary with a link to Business details.
- Products: show usage count and last used; allow weeks/months/years; unique SKU per business.
