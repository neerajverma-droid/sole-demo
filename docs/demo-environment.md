# Demo environment

A prospect opens `/au?industry=plumbing` or `/nz?industry=hairdressers` and lands in a fully
populated Sole account for that industry, in that country, that they can actually use. Everything
runs in their browser tab. There is no demo backend, database, pool or cleanup job.

## How it works

```
/au?industry=plumbing ─► startDemo({industry,country}) ─► mock POST /demo/login
                                                            │
                           session (window.name) ◄──────────┤ startDemoSession()
                           { industry, country, expiresAt,  │
                             lastSeenAt, ops[] }            ▼
                                              buildStory(industry, country)
                                                            │ industry template + country config
                                                            ▼
                                              generateSeedData(story)  ← in-memory books
                                                            │
          every API call ─► handleMockRequest ─► reads/writes the in-memory books
                                                  └► localizeResponse() re-skins hand-written handlers
```

| Concern | Where |
| --- | --- |
| The 50 industries (slug, category, plan modules) | `lib/demo-seed/industries/catalog.ts` |
| One small data file per industry | `lib/demo-seed/industries/templates/*.ts` |
| Client pools (16 clients each) | `lib/demo-seed/industries/pools/*.ts` |
| Country rules (AU/NZ): tax, labels, identifiers, bank format, fiscal year, features | `lib/demo-seed/country.ts`, `identity.ts` |
| Template + country → one business (`Story`) | `lib/demo-seed/build-story.ts` |
| Books generation (invoices, quotes, expenses, bank, km, …) | `lib/demo-seed/generator.ts`, `derive-narrative.ts` |
| Hand-built default (Coastal Spark Electrical, AU) kept verbatim | `story.ts`, `legacy-narrative.ts` |
| Create/edit/delete for contacts, invoices, quotes, expenses, price list | `lib/demo-seed/overlay.ts` |
| Visit lifecycle: start, heartbeat, idle/hard expiry, sign-out, reload replay | `lib/demo-seed/session.ts` |
| Re-skin hand-written handlers for another industry/country | `lib/demo-seed/localize.ts` |
| Entry route and industry picker | `components/auth/demo-entry.tsx`, `app/(auth)/au`, `app/(auth)/nz` |

## Feature handlers (`lib/demo-seed/handlers/`)

Each larger feature has its own handler file, consulted before the generic handlers in `mock-server.ts`
(a handler returns `null` to pass). Handlers that change data mutate the in-memory books, and their writes
are recorded and replayed after a reload like every other write.

| Handler | What it serves |
| --- | --- |
| `documents.ts` | Invoice and quote previews, saved or unsaved (editor Preview), as HTML rendered from the real Sole templates ported to `doc-templates/`; the template list for Sales settings → Styling |
| `ndis.ts` | NDIS support-item search and price-guide catalogue (`ndis-data.ts`, sample prices), NDIS template gallery, participants' NDIS numbers and plan managers, NDIS proposal templates and quote defaults — AU NDIS businesses only |
| `projects.ts` | The Projects module: 10 projects per industry (draft / in progress / closed) with jobs, tasks, time, stats, invoices and expenses linked by `project_id` (`projects-data.ts`) |
| `quick-actions.ts` | Quick actions and AI transactions: AI-categorised bank lines (confident ones, document matches, and ones that need review), approve / match / reject, progress and priorities |
| `defaults.ts` | Contacts → Default (about 60 global suppliers, local equivalents for NZ), the contact picker, and the next invoice / quote number (with the duplicate check) |
| `sales.ts` | Invoice and quote statuses, tab counts, summary tiles and the quote list, all from one rule so they always agree (an unpaid invoice past its due date is overdue; a quote's status is the app's display status) |
| `planner.ts` | The task Planner board and list: ~22 tasks per industry across four stages, filters, sorting, paging, stage moves and bulk move |
| `templates.ts` | "Start from a template" for every non-NDIS industry: 8 invoice and 8 quote templates built from the industry's own price list, favourites, and a preview rendered on the real layout |

Each business also gets a generated monogram logo and brand colour (`logo.ts`), used in the sidebar, the branding
settings and on invoice and quote previews. The asset register (with matched and unmatched assets) and the bank
match dialog's candidates are served from `quick-actions.ts`, which owns the bank lines.

Every plan module is unlocked for every industry so a prospect can visit all of them; only modules the country's
registry doesn't offer (e.g. Investment property and Tax estimator in NZ) stay off.

Invoice and quote previews: the four preview fetchers (`lib/invoices.ts`, `lib/quotes.ts`,
`lib/invoice-submit.ts`, `lib/quote-submit.ts`) keep an HTML blob as HTML through `lib/document-blob.ts`; a
real PDF from a real backend is handled exactly as before.

## Lifecycle and isolation

- **Starts** when `/demo/login` is called with an industry. A login without one resumes the live
  visit (the app signs in again on any page load that has no stored tokens).
- **Ends** on sign-out (`/auth/logout`), when the tab is closed, after `NEXT_PUBLIC_DEMO_SESSION_MINUTES`
  (default 120, hard cap) or `NEXT_PUBLIC_DEMO_IDLE_MINUTES` (default 30) without a heartbeat. A heartbeat
  after the end answers 401 and the app shows its normal "demo ended" handling.
- **Survives a reload**: the session and a short log of the visitor's writes are kept in `window.name`
  (it lives and dies with the tab; `sessionStorage` is emptied by the app's sign-out teardown). On reload
  the books are regenerated and the writes replayed.
- **Isolation**: nothing leaves the tab. Every request is answered by `handleMockRequest`; no real API
  is called, so a demo visitor cannot reach real users, businesses or production data.
- **Only what the overlay supports is writable**; any other write is refused with a visible message.

## Adding or changing an industry

1. Add a row in `catalog.ts` (slug, category, tier, modules).
2. Add a template in `templates/` (services, products if it uses inventory, suppliers, assets, staff,
   vehicle, job wording). Everything else is derived. `tests/demo/industry-templates.test.ts` enforces the shape.
3. Reuse a client pool, or add one in `pools/` and register it in `pools/index.ts`.

Unknown slugs fall back to the default demo; category names (`?industry=trades-and-construction`) resolve to
the broadest industry in the group.

## Country (AU / NZ)

Taken from sole-ocr's `src/services/country/fallback-countries.json`. NZ: GST 15%, "GST return", NZBN and GST
number, a single account number (no BSB), regions, Akahu, fiscal year from 1 April, bi-monthly filing, KiwiSaver,
and the registry's features off (`ndis`, `super_contributions`, `income_tax_estimator`, `investment_property`,
`bank_feeds`). Served from the mock's `GET /country-context`.

## Known limitations

- Report figures (P&L, balance sheet, trial balance, BAS/GST return boxes) are static in the mock; they are
  re-labelled per country and industry but not recomputed from the generated or edited books.
- The invoices page's "invoiced this year" summary tiles show 0 (also true before this work).
- Document previews use the demo's brand colours, print phone numbers as typed, and don't support multi-currency
  or deposit documents; the general (non-classic, non-NDIS) layouts aren't ported, so those ids render on a classic layout.
- NDIS prices and item numbers are sample data, not the official price guide.
- The transactions page's second bank account is a fixed AU-style sample, not generated per country.
- Writes outside contacts, invoices, quotes, expenses and price-list items (projects, bills, assets, payroll,
  bank matching, settings…) are not saved.
- Emails, payments, bank feeds and AI never run: there is no backend to run them.
- Only 50 industries exist in the source of truth (`sole-webapp/lib/industry-packages.ts`), not 56.
