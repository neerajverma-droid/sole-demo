# Nexxtap tap-to-pay: end-to-end flow (mobile → webhook → Sole → bank matching)

> **Living document. Whenever you change anything in this flow (code, DB, env, scripts, decisions, test data), update this file in the same session — especially §10 (status), §11 (gaps) and §12 (changelog).** A new chat should be able to read only this file and be productive.
>
> Last updated: **2026-11-17** · Owner: Gaurav · Working branch (sole-ocr): `feat/nexxtap-settlement` (uncommitted)

---

## 1. What this is, in one paragraph

A merchant (Sole user) takes a card payment for an invoice by tapping a card on their phone via the **Nexxtap** app. Nexxtap approves it and POSTs a webhook; we store the tap and mark the invoice as paid-via-Nexxtap. **Nexxtap pays the money out later, in bulk:** all approved taps of one *processing day* land in the merchant's bank the next business day as **one deposit**, net of a fee, described `WGT <merchant name> <statement number>`. There is **no settlement API and no settlement webhook**, so nothing tells us which invoices a deposit covers. The settlement job (`nexxtapSettlement.service.js`) solves this by recomputing the expected deposit per processing day and finding the matching unmatched bank line.

**The core problem we are solving:** invoices 10 ($200), 11 ($300), 12 ($500) tapped on 17-11 → one bank credit of $987.50 on 18-11. Match that credit to those three invoices automatically.

---

## 2. Repos and who owns what

All under `/Users/gaurav/kiikan/`.

| Repo | Role in this flow |
|---|---|
| `sole-webapp` | Next.js web app. Nexxtap **onboarding UI**, **Payments tab** (list of taps), invoice list. Never calls Nexxtap or the payments service directly. |
| `sole-ocr` | Main backend (Express + Sequelize, MySQL). **Authenticates users, proxies onboarding to payments, stores the mirrored taps (`nexxtap_payments`), and runs the settlement matching.** Branch of interest: `feat/nexxtap-settlement`. |
| `payments` | Separate Node service (Postgres). `nextTap/` module: **receives the Nexxtap webhook** (authoritative store), talks to Nexxtap MAPS (onboarding), mirrors each tap into sole-ocr. |
| Mobile app | **Not in any repo on this machine** — its code was not found. Everything about it below comes from the Nexxtap Slack chat. Update this row when you find the repo. |
| Nexxtap | External. MAPS API (merchant onboarding, MID verify) + Payment App (the app-to-app tap flow). |

---

## 3. Flow A — merchant onboarding & MID link (context only, "onboarding is fine")

```
sole-webapp /payments/nexttap/onboarding/*  ──►  sole-ocr  /api/nexxtap/*   (verifyUser)
                                                    │  nexxtapProxy.service.js
                                                    ▼
                                      payments  /api/nexxtap/*   (requireSoleService: PAYMENTS_SERVICE_TOKEN)
                                                    │  nexxtapClient.js
                                                    ▼
                                        Nexxtap MAPS API  (create application, files, submit, verify MID)
```
- Existing Nexxtap merchants skip the application: user enters ABN/ACN + MID → `POST /api/nexxtap/merchant/verify` → payments calls MAPS `GET /api/merchant/{abn_or_acn}/verify/{merchant_id}` (returns `pass`/`fail`) → payments calls back `POST /api/payments/nexxtap/link-merchant` on sole-ocr.
- Result lives on `businesses`: `using_nexxtap`, `nexxtap_mid`, `nexxtap_verified_abn`, `nexxtap_verified_at`. The mobile app/web read it via `GET /api/payments/nexxtap/merchant` to decide whether to show "Pay via Nexxtap".
- Approval/denial of a new application is by **email only** (no webhook). Production onboarding can only be tested with real credentials.

---

## 4. Flow B — taking a payment (mobile → webhook → Sole)

```
Mobile app (invoice screen, "Get payment via Nexxtap")
   │ opens deep link  nexxtap://local/payment?amount=<dollars>&order=<invoiceId>
   │                  &resultScheme=com.au.app.soleapp&resultUrl=<payments webhook URL>
   ▼
Nexxtap app (activated once with the merchant's MID; terminal bound to that MID)
   │ customer taps card on the phone's NFC reader
   │ (a) opens   com.au.app.soleapp://nexxtap-result?response=approved&...   → mobile shows result
   │ (b) POSTs   the result JSON to resultUrl                                → our backend
   ▼
payments  POST /api/nexxtap/:type/:user_id/webhook   (also POST /api/nexxtap/webhook) — UNAUTHENTICATED
   │ paymentWebhook.controller → paymentWebhook.service.recordPaymentWebhook
   │ writes payments-DB `nexxtap_payments` row (authoritative), module_id = order_id
   ▼ soleSync.service.syncPaymentToSole  (never throws; failure is logged, webhook still 200)
sole-ocr  POST /api/payments/nexxtap/sync   (paymentsServiceAuth: Bearer PAYMENTS_SERVICE_TOKEN)
   │ payments.controller.syncNexxtapPayment → payments.service.recordNexxtapPayment
   │ resolveInvoice(module, module_id): invoices.id = module_id → owner user + invoice
   │ findOrCreate on nexxtap_payment_id (idempotent) → sole-ocr `nexxtap_payments`
   │ approved & not refund → invoices.pay_via_nexxtap = 1, settlement_status = 'pending' (*see §10)
   ▼
sole-webapp Payments tab ← GET /api/payments/nexxtap/transactions
```

**Webhook payload (confirmed by Nexxtap, real example):**
```json
{ "order_id": "138740", "response": "approved", "display": "Approval Code AK4701",
  "amount": 11000, "auth_code": "AK4701",
  "payment_details": { "transaction_id": "<uuid>", "transaction_type": 0,
     "transaction_timestamp": "2026-10-29T12:23:49+0000", "truncated_pan": "8820",
     "expiry_date": "11/2026", "scheme": "VISA" } }
```
- `amount` is an **integer in cents** (normalised by `normalizeAmount`). `transaction_timestamp` is **UTC** (`+0000`). `transaction_type`: **0 = payment, 20 = refund**. Fires for every result (approved/declined/errored/refunded); Nexxtap's retry behaviour is unconfirmed.
- Approved vs declined in preprod: whole-dollar amount (5.00) approves, amount with decimals (5.20) declines. Currency shown may be wrong on preprod; production is AUD.
- `status` normalised to `approved | declined | failed | pending`. Only `approved` money counts.

---

## 5. Flow C — settlement matching (the new work)

### 5.1 Nexxtap's settlement rules (from the Slack chat — these drive the maths)
- **Processing day = 12:01am–11:59pm UTC+10** (Nexxtap says fixed +10; we are in AEDT = +11 now — **unconfirmed whether the cut-off follows Sydney time**).
- Deposit lands **next business day ~8–10am**, as **one deposit for the whole day**. Weekends/holidays: "combined into a single deposit" (exact grouping unconfirmed).
- **Fee ≈ 1.25%** (Sole sets the rate per merchant), deducted **once from the combined total**, not per transaction. A refund does **not** give the fee back ($100 tapped + $100 refunded = fee still $1.25).
- Bank description: `WGT <Merchant Name> <Statement Number>` e.g. `WGT Bobby Burgers 12345`.
- Status after settlement stays `approved` (never "settled"). **No API** for settlement/payout; merchants download statements from the Nexxtap merchant portal.
- Refunds: full amount only (no partial), only possible **before the processing day ends**; a pre-settlement refund is deducted from that day's settlement. Initiated by the merchant via Sole; customer must tap again.
- Test MIDs: `TESTSOLE1` (Nexxtap's test MID, transactions show in the portal under it), `SOLEAPPN01` (the MID linked to user 24720). Portal: `merchant.test.nexxtap.com`. **Credentials are in the Slack chat — never write them here.**

### 5.2 The algorithm (`sole-ocr/src/services/nexxtapSettlement.service.js`)
Per user, `runNexxtapSettlement({ userId?, dryRun? })`:
1. `releaseUndoneSettlements` — any `settled` tap whose invoice allocation on the deposit no longer exists (user undid the match) → `manual` (never auto-matched again). Skipped in dry runs.
2. Load open taps: `status='approved'`, `settlement_status IN (pending, needs_review)`, `settlement_transaction_id IS NULL`, `invoice_id` not null, `created_at` within **30 days**, not refunds (type ≠ 20).
3. **Batch** by `business_id | processing day` (tap's `transaction_timestamp` UTC → +10h → date; falls back to `created_at`). `gross = Σ totals`.
4. **Expected deposit = gross − round(gross × 1.25%)**, tolerance `max(0.05, 0.25% of gross)` (so fee must be 1%–1.5%).
5. **Find the deposit** with `findUnmatchedProviderTransactions` (`provider:'nexxtap'`, credit, `minConfidence:'high'`, amount±tol): first the processing day + 1 day; then up to +4 days (skipping a line that is the next-day deposit of another open day). Exactly one → match; more than one → `needs_review`; none → stays `pending`.
6. **Weekend/holiday:** days still pending are retried in runs of 2–4 consecutive days as one combined deposit (longest first).
7. **Match** in one DB transaction (locks the bank line + taps, re-checks):
   - real `fee = gross − deposit` must be within range else `UnsafeMatch` → `needs_review`.
   - fee split across taps by share (last tap takes the rounding).
   - per invoice: **journal** `Dr Cash (net) + Dr Bank Fees (fee share) = Cr Sales Income + Cr GST (gross, GST proportional to invoice)`; **reconciliation record = net** (so records sum to the deposit); **allocation = gross** via `applyInvoicePaymentAllocation` (`BANK_MATCH`, `syncInvoiceStatus:true` → invoice becomes paid).
   - taps → `settled` with `settlement_transaction_id`, `settlement_fee`, `settled_at`.
8. **Invoice that can't take its part** (draft / paid with cash / already paid / owes less than tapped): *added 2026-11-17.* The deposit still contains that tap, so the day's expected deposit is unchanged. The other invoices are matched; the blocked tap → `needs_review` **with `settlement_transaction_id` set** (so it isn't retried); that invoice's share of the bank line stays **open** for manual match. If *every* invoice is blocked: nothing booked, bank line untouched, batch `needs_review`.
9. **Dry run** (`dryRun:true`): does every read/check, writes nothing; returns `details[]` per day (gross, expected fee/deposit, candidate lines, chosen deposit, per-invoice plan `settle|skip` + reason, outcome + reason).

Result shape: `{ users, batches, settled, pending, needs_review, failed, released, blocked_payments, dry_run, details[] }`.

### 5.3 Statuses (`nexxtap_payments.settlement_status`)
| Value | Meaning |
|---|---|
| `pending` | approved, waiting for its deposit |
| `settled` | matched to `settlement_transaction_id` |
| `needs_review` | ambiguous deposit, unsafe match, or invoice couldn't take it (waiting on user) |
| `manual` | user undid the match; left for hand-matching, never auto-matched |
| `NULL` | nothing to settle (declined, refund) — **or an approved tap synced by old code, see §10** |

### 5.4 Bank-line finder (`paymentProviderBankTransactions.js`)
`findUnmatchedProviderTransactions({ userId, provider: 'stripe'|'sole_pay'|'nexxtap', amount, amountTolerance, date, daysBefore, daysAfter, direction, minConfidence, scope, limit })` — recognises provider lines **by description text only**, over `transactions` rows with `source IN (bank_feed, manual_upload)`, `amount>0`, and **unmatched** (`UNMATCHED_SQL`: no reconciliation_records, reconcile_nonaccounting, journal entry for the txn, invoice/expense/asset/liability/capital link, payment allocation or credit note). Nexxtap rule: `\bWGT\s+\S.*?\s\d{3,}\b` (high) — needs `WGT`, a name, then a ≥3-digit number. Excludes card purchases, `PAYRIX*`/`STRIPE*` descriptors, `SOLEAPP`. Bank lines come from Fiskil (later) or bulk/CSV upload (testing).

### 5.5 Config / env (sole-ocr)
| Var | Default | Use |
|---|---|---|
| `NEXXTAP_FEE_RATE` | `0.0125` (accepted if 0 < x < 0.1) | fee rate (**env-only for now; per-business rate is a TODO**) |
| `NEXXTAP_SETTLEMENT_LOOKBACK_DAYS` | `30` | how old a tap may be |
| `NEXXTAP_SETTLEMENT_TIMEZONE` | `Australia/Brisbane` (fixed +10) | cron tz |
| `NEXXTAP_SETTLEMENT_CRON` / `_NIGHTLY_CRON` | `*/30 7-14 * * *` / `0 22 * * *` | cron schedules |
| `PAYMENTS_SERVICE_TOKEN` | – | shared secret, payments ⇄ sole-ocr |
| payments: `SOLE_API_BASE_URL`, `NEXXTAP_API_BASE_URL`, `NEXXTAP_AUTH_EMAIL/PASSWORD` | – | sync target, MAPS API |

**The cron (`src/worker/nexxtapSettlementCron.js`) exists but is deliberately NOT registered.** Dev moved cron startup into `startCrons()` / `worker.js`; register it there when ready.

---

## 6. Data model

**`nexxtap_payments`** exists in **both DBs** (payments=Postgres authoritative; sole-ocr=MySQL mirror). Mirror adds: `nexxtap_payment_id` (UNIQUE, = payments-DB row id → idempotency), `invoice_id` (NULL if `module_id` matched no invoice), and the four settlement columns.

| Column (sole-ocr) | Notes |
|---|---|
| `user_id`, `invoice_id`, `module`, `module_id` | `module_id` = Nexxtap `order_id` (= `invoices.id`); `UNKNOWN` if order empty (refunds today) |
| `transaction_id` (UUID), `auth_code`, `display_message`, `response_status`, `status` | |
| `amount_cents`, `amount`, `surcharge`, `gratuity`, `total` | settlement uses `total` |
| `card_scheme/last4/expiry`, `transaction_type` (0/20), `transaction_timestamp` (**string, UTC**), `raw_payload` JSON | |
| `settlement_status`, `settlement_transaction_id` (→ `transactions.id`), `settlement_fee`, `settled_at` | migration `0187_add_settlement_to_nexxtap_payments.sql` |

Other tables touched: `invoices` (`pay_via_nexxtap`, `mark_as`, `bank_transaction_id`), `businesses` (merchant link cols), `transactions` (bank lines; `source` enum has **no `nexxtap`** value — deposits are `bank_feed`/`manual_upload`), `journal_entries`/`journal_lines`, `reconciliation_records`, `invoice_payment_allocations`.

---

## 7. File map

**sole-ocr** (`/Users/gaurav/kiikan/sole-ocr`)
| File | What |
|---|---|
| `src/routes/payments.js`, `src/controllers/payments.controller.js` | `/api/payments/nexxtap/{sync, merchant, transactions, invoices/:invoiceId, link-merchant, unlink-merchant}` |
| `src/services/payments.service.js` | `recordNexxtapPayment` (sync), merchant link/unlink, `listNexxtapPayments`, `getNexxtapPaymentsForInvoice`, serialisers + summary (now incl. settlement fields, `pending_settlement_*`) |
| `src/routes/nexxtap.js`, `src/controllers/nexxtap.controller.js`, `src/services/nexxtapProxy.service.js` | onboarding proxy to payments |
| `src/services/nexxtapSettlement.service.js` | **the settlement job** (`runNexxtapSettlement`, `blockReason`, `processingDay`, `expectedFee/Deposit`, `splitFee`) |
| `src/services/paymentProviderBankTransactions.js` | bank-line finder (stripe / sole_pay / nexxtap) |
| `src/worker/nexxtapSettlementCron.js` | cron wrapper (not registered) |
| `src/services/invoice/invoice.js` | `getMatchedAmountRows` counts the Bank-Fees share as paid; `fetchInvoicesV2` adds `nexxtap_settlement_status` per invoice |
| `src/services/v2/bankTransaction.js` | match lines now carry `side: 'debit'|'credit'` (fee line is a debit) |
| `src/models/nexxtap_payments.js`, `businesses.js`, `invoices.js` | models |
| `migrations/0134_create_nexxtap_payments.sql`, `0135_…businesses.sql`, `0136_…invoices.sql`, **`0187_add_settlement_to_nexxtap_payments.sql`** | schema |
| `scripts/runNexxtapSettlement.js` | run the job by hand (dry run default) |
| `scripts/seedNexxtapTestTaps.js` | create dummy taps via the real sync code |
| `tests/unit/services/nexxtapSettlement.test.js` (26), `paymentProviderBankTransactions.test.js`, `payments.nexxtapInvoicePayments.test.js`, `payments.nexxtapRefunds.test.js` | 114 tests total pass |

**payments** (`/Users/gaurav/kiikan/payments/nextTap/src`)
`routes/nexxtap.routes.js` (webhooks unauthenticated, rest `requireSoleService`), `controllers/paymentWebhook.controller.js`, `services/paymentWebhook.service.js` (parse + store), `services/soleSync.service.js` (mirror to sole-ocr, link/unlink), `models/payment.model.js`, `services/nexxtapClient.js`, `services/onboarding.service.js`, `services/merchantLink.service.js`. Migrations `20260820000000-create-nexxtap-tables.js`, `20260902120000-create-nexxtap-payments.js`.

**sole-webapp** (`/Users/gaurav/kiikan/sole-webapp`)
`app/(app)/payments/nexttap/onboarding/*`, `components/payments/nexxtap/*` (onboarding), `components/payments/payments-transactions.tsx` (`NexxtapTransactions`, stats grid), `hooks/use-payment-transactions-query.ts` (`useNexxtapTransactionsQuery`), `lib/payments.ts` (`fetchNexxtapTransactions`, `mapNexxtapTransaction`, `checkNexxtapConnection`), `lib/nexxtap.ts`, `config/api-routes.ts`. **The web UI does not yet read any settlement field** (`settlement_status`, `nexxtap_settlement_status`, `pending_settlement_*`).

---

## 8. Testing runbook (no real payment needed)

All commands from `sole-ocr/` with `NODE_ENV=development`. Scripts print the DB host first — confirm it's dev. **Writes only happen with `--apply`.** Gaurav runs DB writes/migrations himself; Claude has **SELECT-only** access to the dev DBs when given credentials (never store credentials here).

1. *(optional)* Create dummy taps: `node scripts/seedNexxtapTestTaps.js --user 24720 --tap <invoiceId>=<amount> … [--at <UTC iso>] [--apply]` — prints the expected deposit and the bank line to add.
2. Dry run: `node scripts/runNexxtapSettlement.js --user 24720` → expect `PENDING` + the bank line to add.
3. Create the dummy bank line via CSV upload (Bank transactions → upload; **business 32803 active**). Columns exactly: `Transaction type,Amount,Date,Description` with Date `DD/MM/YYYY`; **the upload rejects future dates**, so date it on/before today (the search window includes the tap day and the day after). Example: `Credit,987.50,17/11/2026,WGT SOLE 12345` (saved at `~/Downloads/nexxtap-dummy-deposit.csv`). Don't categorise/match it afterwards.
4. Dry run again → expect `SETTLED` with per-invoice net; then `--apply`.
5. Verify with SELECTs: invoice `mark_as='paid'`; taps `settled` + `settlement_transaction_id`; `reconciliation_records` for the bank line sum to the deposit; `journal_entries` per invoice.
6. **After a revert/undo** the taps stay `settled` (stale) and the next real run flips them to `manual`. Reset first:
   `UPDATE nexxtap_payments SET settlement_status='pending', settlement_transaction_id=NULL, settlement_fee=NULL, settled_at=NULL WHERE id IN (…) AND user_id=24720;`
   (use `'manual'` to park taps you want excluded from a test).

**Math cheat-sheet:** fee = round(total × 1.25%); `$110 → fee 1.38 → deposit 108.62`; `$200/$300/$500 → fees 2.50/3.75/6.25 → deposit 987.50`.

### Dev fixtures (user **24720**, business **32803**, tenant 1)
| Item | Id | Notes |
|---|---|---|
| Invoice INV-1 | 138740 ($110, GST 10) | tap id 18, processing day 2026-10-29, bank line **2411530** `WGT SOLE 48213` $108.62 (matched once on 2026-10-29, later reverted) |
| Invoices INV-3/4/5 | 138930 / 138931 / 138932 ($200/$300/$500) | taps 20/21/22 on 2026-11-17, bank line **2522470** `WGT SOLE 12345` $987.50 dated 17 Nov (matched once, then reverted) |
| Refund tap | id 19 | type 20, `module_id='UNKNOWN'`, no invoice (the empty-`order_id` problem) |
| Deleted lines | 2411527, 2411529 | older dummy `WGT SOLE 48213` lines, soft-deleted |

State observed 2026-11-17 after Gaurav reverted all matches: taps 18/20/21/22 still `settled` (stale); invoices back to `sent`; both bank lines unmatched. A reset SQL (18 → pending, 20–22 → manual, to test INV-1 alone first) was given — **not yet confirmed run**.

Unit tests: `npx jest tests/unit/services/nexxtapSettlement.test.js tests/unit/services/paymentProviderBankTransactions.test.js tests/unit/services/payments.nexxtapInvoicePayments.test.js tests/unit/services/payments.nexxtapRefunds.test.js`. **Pre-existing failures unrelated to this work** (identical on clean `dev`): 65 route tests (e.g. `bankTransaction-routes`, `auth-routes`) and 4 service suites / 15 tests (`defaultTemplate-participant…`, `templates-getinvoicedata-participant`, `assets.inventory`, `client.bulk-import`).

---

## 9. Decisions made (don't re-litigate without reason)
- Restore and extend the earlier settlement work (it had been left in `stash@{0}` on sole-ocr — *kept as a backup*) instead of rewriting.
- **Payments only for now; refunds are out of scope** (refund taps are ignored by the job).
- **Fee rate from env default (1.25%)**, no per-business column yet.
- **Already-paid invoice in a batch:** don't block the whole day — settle the rest, leave that share of the bank line open, mark the tap `needs_review` (§5.2 step 8).
- The function is run **by hand** (script) first; **cron not registered**.
- No new DB column for "why needs_review" (would break dev until the migration is run); reasons appear in the dry-run report and logs only.

---

## 10. Current status (keep this section honest)
- **sole-ocr branch `feat/nexxtap-settlement`, nothing committed.** Created from `dev` 2026-11-17. Contains: restored stash (conflicts in `server.js`/`invoice.js` resolved to dev's version; migration renumbered 0163→**0187**), blocked-invoice handling, dry-run mode, the two scripts, 26 settlement tests.
- **Dev DB** already has the four settlement columns (applied earlier under the old 0163 name; 0187 is the same, idempotent, so re-running is harmless).
- **The deployed dev backend runs OLD code:** its sync does *not* set `settlement_status='pending'`, so **new taps arrive with `NULL` and the job ignores them** until `payments.service.js` from this branch is deployed — or run the backfill/`UPDATE … SET settlement_status='pending' WHERE settlement_status IS NULL AND status='approved' AND COALESCE(transaction_type,0)<>20`. (Observed for taps 20–22 on 2026-11-17.)
- A real `--apply` run already succeeded once on dev (2026-10-29: INV-1 ↔ line 2411530; 2026-11-17: INV-3/4/5 ↔ line 2522470) before being reverted by hand — the end-to-end journal/reconciliation/allocation path is proven.
- Cron not registered. Webapp doesn't show settlement state yet.

---

## 11. Known gaps / edge cases / TODO
| # | Gap | Notes / plan |
|---|---|---|
| 1 | **Refunds (type 20)** | Webhook `order_id` is empty → stored `UNKNOWN`, no invoice. Real deposit = gross − fee(gross) − same-day refunds; fee not returned; a fully-refunded day nets *negative* (a debit line). Link refund→original by same day + amount + card_last4, or fix mobile to pass `order`. |
| 2 | **Taps with no invoice** are excluded from batches but **are in the real deposit** → expected total comes up short and the day never matches | include them in gross and flag. |
| 3 | **Duplicate webhook retries** | payments service has no unique index on `transaction_id`; sole-ocr dedupes only on `nexxtap_payment_id` → duplicates inflate the day's gross. Dedupe on `transaction_id`. |
| 4 | Fee rate per business | env-only now; Nexxtap lets Sole set it per merchant. |
| 5 | Fee rounding & DST cut-off (AEDT +11 vs fixed +10) & weekend grouping | **ask Nexxtap**; validate with a real low-value production test (LVPT). Preprod may never produce a real deposit. |
| 6 | Tips/surcharge | job uses `total`; if `total` > invoice remaining the invoice is blocked. |
| 7 | Non-AUD invoices | Nexxtap is AUD-only; not checked. |
| 8 | Reasons for `needs_review` not persisted / not shown in UI | needs a column + migration + webapp work. |
| 9 | Webapp shows no settlement status | fields already returned by the API (`settlement_status`, `settlement_fee`, `settlement{}`, `pending_settlement_*`, invoice list `nexxtap_settlement_status`). |
| 10 | Webhook URL is unauthenticated | `POST /api/nexxtap/:type/:user_id/webhook` accepts anything. |
| 11 | Mobile app repo not located | confirm exact deep-link/`resultUrl` construction; the web `resultScheme` handler issue was fixed by Nexxtap in the preprod APK. |
| 12 | 30-day lookback | taps older than 30 days are never auto-matched (INV-1's tap ages out ≈ 28 Nov). |
| 13 | Dry-run `claimed` set | in a dry run two days could be planned onto one deposit in odd cases (real run is DB-guarded). |
| 14 | Cron not registered; multi-instance safety is DB locks only (the `running` flag is per-process) | register in `startCrons()` when ready. |

---

## 12. Changelog (newest first — append an entry for every change to this flow)
- **2026-11-17** — Created this doc. Restored settlement work from `stash@{0}` onto `feat/nexxtap-settlement`; merged conflicts; migration → 0187. Added blocked-invoice handling (partial settle), `dryRun` + per-day `details` report, `scripts/runNexxtapSettlement.js`, `scripts/seedNexxtapTestTaps.js`, 12 new tests (26 in `nexxtapSettlement.test.js`). Verified on dev DB: earlier real runs worked; deployed dev backend lacks the `settlement_status='pending'` on sync (§10). Produced CSV `~/Downloads/nexxtap-dummy-deposit.csv` for the dummy $987.50 deposit. Gave reset SQL to test INV-1 alone against line 2411530.
- **2026-10-29/30** (earlier, from git/DB evidence) — Original settlement service, cron, finder, migration 0163 written and applied on dev; refund handling WIP on `dev` (`3b5ecdf4`) left in `stash@{0}`.
