# Mixpanel integration — implementation plan

New Mixpanel project, new codebase, no history to carry. The old project
(`4054926`, used by `sole-webapp`) keeps its data and keeps running until the
switch; nothing here reads from it or writes to it.

A clean start is the point of this document. Every rule below exists because of
a specific thing that went wrong in the old integration, and the second half of
each rule is the check that stops it happening again.

---

## Why the checks matter more than the rules

Nothing in the old integration was written carelessly. Every defect was
**silent** — the code ran, no error appeared, and the data was wrong for weeks
before anyone noticed:

| What happened | How long it went unseen |
|---|---|
| `identify()` keyed on email instead of the backend id | the whole life of the project — 479 profiles |
| UTM read from router state, which is empty before hydration | every campaign attribution null |
| Three events renamed mid-flight | each rename silently zeroed a funnel |
| `trackSubscription()` fires `plan_upgraded` and is never called | never fired once |
| A funnel step that fires from the sidebar, not from signup | signup conversion read 1% instead of 33% |

So "be careful" is not a plan. Each rule below pairs with something that
**breaks the build or fails a test** when it is violated.

---

## The checks

| Check | Stops |
|---|---|
| Event name must be in the typed union → **build fails** | A rename or typo quietly zeroing a funnel |
| Every exported tracker has a call site → **test fails** | Dead tracking (four such functions existed) |
| `identify()` cannot be called without a `user_id` → **build fails** | Falling back to email |
| Dev-only validator: unknown event, or a required property missing → **console error** | `invoice_sent` arriving with no `amount` |
| Staging smoke test: fire every event once, read it back from Mixpanel → **CI fails** | "It was written but never reached production" |

The last one is the only check that proves data actually arrives. The others
are about the code; that one is about the pipeline.

---

## Identity

```
distinct_id   user_id          nothing else, ever
$user_id      user_id
$email        email            a property, for lookup and support
```

**No fallback.** The old integration used `String(user.id || email)`; `user.id`
never existed on the auth payload, so every profile was keyed on an email
address. Email is not a stable key — a customer who changes theirs starts a new
history — and recovering from it needed a merge step that should never have
been necessary.

Rules:

1. Identify only when `status === "authenticated"`. On `"loading"` the profile
   has not arrived; identifying then is guessing, and resetting then signs the
   user out of Mixpanel on every navigation.
2. Read the id through `sessionUserId()` from `stores/session`. Never inline
   `user.user_id` or `user.id` at a call site — one function is why the new UI
   does not already have the old bug.
3. `authenticated` with no `user_id` is a defect, not a case to handle. Send an
   `identify_failed` event and log an error. Do not substitute anything.
4. Events fired before identify are not lost; Mixpanel links the anonymous id
   to the identified one.

---

## Super properties — on every event

```
app             'new_ui'
is_internal     boolean      see below
plan            'free' | 'trial' | 'paid'
business_id     the active business
utm_source      from window.location.search, first load only
utm_medium
utm_campaign
referrer
landing_page
```

**`plan` must say `'trial'` during a trial.** In the old project every profile
reads `plan: 'free'`, including people mid-trial, so filtering on plan to find
trial users returns zero. Trial users there are only findable through
`trial_started_at`.

**UTM comes from `window.location.search`.** Not from router state, not from a
hook that reads search params after hydration. That is the exact mistake that
left every campaign attribution null in the old app.

**`is_internal` from day one.** The one thing the analytics team asked for that
cannot be supplied today is a flag separating staff and test accounts from
customers — in the old project `yopmail.com` addresses sit in the middle of the
customer numbers with no way to exclude them. It is cheap now and impossible to
backfill.

---

## Events

### Fire on success, with the value

> An event fires **after the server confirms the action**, and carries what the
> action was worth.

The old integration's largest reporting gap was a single property: all 9,432
`module_used` rows carry `action: "viewed"`. It records that a screen opened,
which answers nothing about whether anyone did anything.

A count alone does not satisfy "invoice sent **with invoice value**". Required
properties per event are part of the contract and the dev validator enforces
them:

| Event | Required |
|---|---|
| `invoice_created` / `invoice_sent` | `amount` |
| `invoice_paid` | `amount`, `days_to_payment` |
| `expense_logged` | `amount` |
| `asset_added` | `value` |
| `km_trip_logged` | `distance_km` |
| `time_entry_logged` | `duration_minutes` |

### Names are a contract

```ts
export const EVENTS = { ... } as const;
export type EventName = typeof EVENTS[keyof typeof EVENTS];
```

**Never rename an event.** Add a new one, deprecate the old one, never reuse a
name. In a funnel a renamed event and a deleted event look identical — both
read zero — which is why three renames in the old app each killed a funnel
without anyone noticing.

### Check what a funnel step actually is

Before an event is used as a funnel stage, confirm where it fires from.
`setup_business_profile_created` was treated as a signup step; it fires from the
sidebar and the business-profile page. Signup conversion read about 1% until
that was found. The real figure was 33%.

---

## Profile properties

Set at signup **and re-asserted at every session start.**

Set-at-signup-only is why only 60 of 479 profiles in the old project carry trial
dates: `trackSignup` runs once, and anyone who signed up before tracking began
never gets them. Re-asserting on session start backfills everyone who returns.

Re-assert: `plan`, `trial_active`, `trial_started_at`, `trial_ends_at`,
`subscription_status`, `industry`, `abn_present`, `switching_from`.

A super property set behind a conditional is worth checking twice:
`switching_from` was registered inside a guard that never evaluated true, and
across 18,918 events not one carried it.

---

## Never send

- **Cancellation free text.** The predefined label only. Customer-written text
  cannot be redacted once it reaches a third-party tool; it stays in the Sole
  database.
- **The ABN number.** `abn_present` as a boolean. The number identifies an
  Australian business outright.
- Any other free-text field a customer typed.

---

## Session replay

```
record_sessions_percent: 10
record_mask_all_text:    true
record_mask_all_inputs:  true
record_console:          false
record_heatmap_data:     false
```

In the old project `$mp_session_record` accounts for 27,824 events — about a
third of all volume. Sampled at 10% it stays useful without drowning the signal,
and it is the reason `total_events` must never be used as an engagement metric:
it is mostly page views and replay chunks, not work done.

---

## Where it lives — most of it already does

`lib/analytics.ts` already exists and is exactly the right seam. Its own
comment says so:

> *There is no analytics provider wired into this app yet... What the product
> needs first is a single call site shape — one verb, an event name, a flat bag
> of properties... Swapping the body below for a real SDK is then one change in
> one file.*

Today it console-logs in development and does nothing in production. **That body
is the integration.** Do not add a parallel `lib/analytics/client.ts`; the call
shape `track("name", { flat props })` is already in use and already matches
what the old app sent.

Nine events are live at two call sites and keep working the moment the body is
swapped:

```
activation_nudge_shown            onboarding_survey_shown
activation_nudge_cta_clicked      onboarding_survey_completed
activation_nudge_dismissed        onboarding_survey_dismissed
onboarding_referral_prompt_shown  onboarding_survey_industry_selected
                                  onboarding_survey_pins_saved
```

Six of those names match the old project exactly. Keep them. Matching names cost
nothing and mean the two projects' onboarding funnels can at least be read
side by side.

What has to be added around it:

```
lib/analytics.ts              swap the body: init, identify, track, reset
lib/analytics-events.ts       the typed name contract and required properties
components/analytics/
  analytics-bootstrap.tsx     "use client", mounted inside SessionProvider
```

`AnalyticsBootstrap` goes next to `UsertourBootstrap` in
`components/providers.tsx` — **inside** `SessionProvider`, because
`useSession` throws outside it and a sibling cannot see the session at all.

### App Router specifics

- There is no `router.events`. Page views come from `usePathname()`.
- `useSearchParams()` without a `<Suspense>` boundary opts the whole route into
  client rendering. If query strings are needed, read them from
  `window.location.search` inside the effect instead.
- React 19 Strict Mode runs effects twice in development. `init()` must be
  idempotent, and anything that attaches a listener needs a cleanup — the same
  reasoning already written into `UsertourBootstrap`.

---

## What to track — derived from this app, not copied

The new UI has **123 routes**. It is substantially larger than the one the old
event list was written for, and several whole modules have no precedent at all.
Copying the old 75 events would leave those dark from day one.

Modules the old integration never tracked:

| Module | Routes | Old coverage |
|---|---|---|
| **SolePay onboarding** | 5 | none |
| **NextTap onboarding** | 8 | none |
| Inventory | 3 | none |
| Transaction rules | 3 | one generic event |
| Reports | 10 named reports | one generic `report_viewed` |
| Business planner | budgets, goals, plans, wallet | one generic `business_planner_used` |
| Asset lifecycle | disposal, insurance, status, schedule | `asset_added` only |
| NDIS invoices and quotes | 2 | none |
| Two-factor auth | 1 | none |
| Client refunds | 3 | none |
| Multi-business | 3 | `business_switched` only |
| Equity, liabilities, contacts | 7 | one event each |

The two payment-provider onboardings are the notable ones: thirteen routes
between them, each a multi-step sequence where people drop out. That is a funnel
with no instrumentation designed for it, and funnels are the thing this product
most needs to see.

### The rule for deciding

A route is not an event. Apply the test from above — **fire on success, with the
value** — and then ask whether anyone would act on the answer:

- **Yes**: a person completed a step of a sequence someone can fix
  (`solepay_onboarding_step_completed`, `invoice_sent`)
- **No**: a screen opened. The old app learned this the expensive way: 9,432
  `module_used` rows, every one of them `action: "viewed"`, answering nothing.

Multi-step sequences take one event with a step property rather than one event
per step — `solepay_onboarding_step_completed { step: "directors" }` — so adding
a step later does not need a new event name and the funnel keeps working.

### Groups to work through, in funnel order

1. **Auth and signup** — the funnel that matters most, and the only one where
   the old names are worth matching exactly so the two projects compare.
   Includes two-factor, which is new.
2. **Onboarding** — already instrumented, nine events live.
3. **Business creation and switching** — multi-business is new here.
4. **Migration** — the old app's richest funnel; the new UI has `/migrations`.
5. **Invoices and quotes** — including the NDIS variants, with `amount` on every
   one and `days_to_payment` on `invoice_paid`.
6. **Expenses, refunds, super contributions.**
7. **Transactions** — reconcile, rules, bulk.
8. **Assets** — beyond `added`: disposal, insurance, status, depreciation.
9. **Inventory, equity, liabilities, contacts.**
10. **Reports** — one event with a `report` property, not ten names.
11. **Payments onboarding** — SolePay and NextTap, one event each with a `step`.
12. **Subscription and paywall** — `paywall_hit`, `upgrade_intent`,
    `plan_upgraded`, `plan_canceled`. These were the dead ones in the old
    project; check each actually fires before trusting a conversion number.

## Phases

**1 — Plumbing.** `lib/analytics/`, the bootstrap, identify, one event
end-to-end. Done when that event appears in the new Mixpanel project with the
right `distinct_id`, `$email` and super properties.

**2 — The contract.** Typed names, required properties, the dev validator, the
call-site test. Done when renaming an event fails the build.

**3 — Events, in funnel order.** Signup first, then onboarding and migration,
then invoice and expense. Each with its required properties, not just a count.

**4 — Verification.** The staging smoke test: fire every event once, read them
back from the Mixpanel API, assert each arrived with its required properties.
This is what makes the data trustworthy rather than hoped-for.

---

## Settled: `sole-ocr` stays on the old project

**Decided 7 Oct 2026 — the reporting pipeline keeps reading 4054926 and is not
touched.** `src/services/mixpanelReports/` takes a single
`MIXPANEL_PROJECT_ID`; it keeps the one it has. No code change, and the
existing Command Centre dashboards and the analytics team's exports keep
working exactly as they do now.

The cost is deferred rather than avoided, and it has a date attached: 4054926
only receives events for as long as `sole-webapp` is the live front end. Once
traffic moves here, that project stops gaining data — so `mixpanel_report` and
`mixpanel_users` snapshots go stale, and the dashboards built on them keep
showing a shrinking trailing window rather than going visibly blank. **That is
the failure mode to watch for: not an error, a number that quietly stops
moving.**

So this needs revisiting at cutover, not before. The options then are the same
two: point `MIXPANEL_PROJECT_ID` at the new project (simple, empties the
history), or read both and write the new one under `mixpanel_newui_*` snapshot
keys (keeps both readable through the transition).

---

## Status — phases 1 and 2 are in

Shipped, with `npx vitest run` (1591 pass), `npx tsc --noEmit`, `npx eslint`
and `npx next build` all clean:

```
lib/analytics.ts                          body swapped for the Mixpanel SDK
lib/analytics-events.ts                   69 names, typed union + required props
lib/analytics.test.ts                     26 tests, one per old-project defect
components/analytics/analytics-bootstrap.tsx
components/providers.tsx                  mounted inside SessionProvider
lib/api/teardown.ts                       reset() on the sign-out path
```

`track()` now takes `EventName`, not `string`, so **a rename fails the build**
— which is phase 2's acceptance test. The nine events already live at the two
onboarding call sites needed no edit: their names were already in the contract.

### Decisions taken while implementing

**Sign-out resets from `clearClientState()`, not only from the bootstrap
effect.** `signOut` sets the status and then hard-navigates, and the browser
can leave before React flushes the effect. The in-place case — a 401 three
screens deep, where nothing re-mounts — is the one that actually bites: the SDK
instance keeps the previous user's `distinct_id` in memory and writes it back
on the next event, so the next person at that browser is counted as them.

**A logged-out visitor is never reset.** Status settles `loading →
unauthenticated` on the first paint, and `reset()` drops super properties — a
blanket reset there would wipe the first-touch campaign of every visitor
arriving from an ad before they ever reached the signup form. Guarded on
having actually identified.

**`register_once` is only given keys that have a value.** It never overwrites,
so a null registered on a first load would permanently block the real campaign
for that browser. Worse than recording nothing, and it is how the old app's
attribution would have stayed null even after the router-state bug was fixed.

**Page views send `path` and `route`.** `/invoices/4821/edit` is also sent as
`/invoices/[id]/edit`; without the second, every invoice ever opened is its own
row and no report can rank screens by use.

**Events fired before `init()` are buffered, not dropped.** `mixpanel.track()`
before `init()` logs and discards. The bootstrap's effect runs first in
practice, but "written and never arrived" is the failure this whole exercise
is about, so they are held (bounded at 50).

**Do Not Track is not honoured — `ignore_dnt: true`.** Decided 7 Oct 2026.
The SDK default is the opposite, and it is what `sole-webapp` does by
omission: a Firefox user with DNT on (Firefox turns it on by itself in a
private window) sends nothing at all there, and that absence is
indistinguishable from someone who never visited. They are not a drop-off in a
funnel; they are not in it.

Set from day one on purpose. Changing this on a project that already holds
data puts a step change into every count on the day it ships, with no way
afterwards to tell a jump in new customers from a jump in newly visible ones.
This project starts empty, so there is no discontinuity to create — which is
exactly why now was the moment to decide it.

The consequence worth stating: the two projects' numbers are **not** directly
comparable across the switch. 4054926 is missing its DNT users and this one is
not, so a rate here will read slightly higher for reasons that have nothing to
do with the product.

**Developer traffic was designed to be labelled, not blocked** — `deploymentEnv()`
tags every event `env: 'local'` or `'deployed'` rather than dropping local
traffic the way `sole-webapp`'s `isTrackingAllowed()` does, specifically so a
developer could confirm the integration works before it reaches a customer.

**That design is currently switched off by request — 8 Oct 2026, "abhi local
mein nahi, sirf live mein use krna hai".** `ALLOW_LOCAL` in `lib/analytics.ts`
is `false`: `initAnalytics()` now returns immediately on `localhost` /
`127.0.0.1` / `192.168.*` / `10.*` and nothing initializes, exactly like the
old app. One flag, documented at its declaration; flipping it to `true` is the
entire change needed to restore the labelled-not-blocked behaviour above —
nothing else about `deploymentEnv` or the `env` tagging needs to move.

**Once it is back on, every saved report still needs `env = deployed` on it**;
without that filter dev clicks are counted as customers, which is a worse
version of the problem the old app was avoiding.

**Bundle cost: ~33 KB gzipped**, added to the shared chunk because `Providers`
is in the root layout. The session recorder is a separate bundle the SDK
fetches lazily only for the 10% of sessions it samples.

### Open

**The project token does not exist yet.** `NEXT_PUBLIC_MIXPANEL_TOKEN` is in
`.env` as an empty placeholder. Until a new Mixpanel project is created and its
token set, `initAnalytics` sends nothing and says so in the development console.
Nothing else in the app changes behaviour. This is the only thing standing
between the integration and live data.

### Phase 3 — the events

**56 events, 60 call sites across 33 files.** `lib/analytics-coverage.test.ts`
passes, which means every declared name has something that fires it.

**Neither payment-provider onboarding is instrumented.** SolePay's and
NextTap's events were both built — a `step` param on their save calls, a
handful of `track()` calls each, six event names total — and both were pulled
back out on request, because those modules are still being stabilised and
instrumenting a flow under active change means measuring a code path that
moves out from under the event. They go back in once each module is called
stable, as a small, self-contained addition — the shape is already written
above, in the plan for group 11.

Instrumented at the **service layer wherever one existed** — `lib/auth.ts`,
`lib/invoice-submit.ts`, `lib/expenses.ts` and the rest — rather than at the
button. Three reasons, all of them lessons from the old app:
the service call is where success is unambiguous, one edit covers every screen
that calls it, and a UI refactor cannot silently drop the event.

The exceptions are the handful of cases where the service genuinely cannot
know what the event needs, and each is commented where it sits:

| Event | Fired from the UI because |
|---|---|
| `invoice_paid` | `markInvoicePaidWithCashApi` takes an id and a date — it cannot say what the invoice was worth or how long it took |
| `asset_disposed` | written through `updateAssetApi`, which cannot tell a disposal from a later edit of an already-disposed asset |
| `tax_estimator_used` | `estimateTax` is pure arithmetic re-run on every keystroke; the Calculate button is the one deliberate act |
| `plan_upgraded`, `upgrade_intent` | the price lives on the plan the screen has selected, not in the API call |

### Names removed before anything shipped

Five declared names described a product this app is not. A name that never
fires is worse than no name: it looks like coverage, someone builds a funnel on
it, and the zero reads as "nobody does this" rather than "nobody measures it".
That is exactly how the old project's `plan_upgraded` stayed empty for its
whole life.

| Removed | Why |
|---|---|
| `payment_recorded` | No standalone record-a-payment flow. An invoice is settled by the cash dialog or a bank match — both `invoice_paid`. A second name would have been double-counted. |
| `receipt_captured` | A receipt is only ever attached while logging an expense, so it is `has_receipt` on `expense_logged`, not an event. |
| `vendor_refund_recorded` | `/expenses/vendor-refunds` is a read-only list with no create route. Nothing could ever have fired it. |
| `product_created` | `/sales/products` and `/inventory` are two screens over one `createInventoryItemApi` call. Kept as `inventory_item_created` alone. |
| `plan_created` | The business planner is budgets, goals and the wallet. There is no "plan" entity and no endpoint that would make one. |

`migration_started` and `migration_failed` went the same way, and
`migration_completed` lost its `source_system` requirement: migration here is
the five-step bring-your-data-in checklist, not a transfer out of a named
accounting package.

### Two signature changes, both for the same reason

One endpoint serving several funnel steps cannot report which step it was, and
guessing is how a funnel ends up measuring the wrong thing.

- `verifyOtp(email, code, context)` — the same endpoint finishes a signup,
  clears a two-step challenge and confirms an address. Without the context the
  two-step codes would have counted as signup verifications and inflated
  signup conversion, which is the same shape of mistake that had the old app
  reading 1% where the truth was 33%.
- `saveSolePayDraft` would have needed the same `step` treatment — one draft
  endpoint serves three sections — but that change is reverted along with the
  rest of SolePay's instrumentation. Worth doing the same way when it returns.

### Privacy, enforced at the call site

`cancelSubscription(reason, otherText)` sends **`reason` only**. The free text
stays in the Sole database where the cancel-feedback endpoint already put it —
it cannot be redacted once it is in a third-party tool, and people put account
details and complaints in that box. `has_other_text` is sent instead, which
answers "is the box worth reading this month" without carrying a word of it.
`business_created` sends `abn_present` as a boolean and never the number.

### Phase 4 — verification

```
npm run test:smoke
```

Fires all 62 declared events at the real ingestion endpoint, polls the export
API until they come back, and compares what arrived against what was sent.

```
lib/analytics-smoke.ts            payload building and the verdict (pure)
lib/analytics-smoke.test.ts       16 tests for that logic, no network
lib/analytics-smoke.live.test.ts  the live run
vitest.smoke.config.ts            its own config — not in `npm test`
```

Separate from the main suite on purpose. It needs credentials, talks to the
network and takes minutes; folded into the suite people run on every save it
would become the test everyone learns to ignore when it is red.

#### What it checks that nothing else can

| Failure | Caught by |
|---|---|
| The token is wrong, so nothing reaches the project | **only this** |
| An event name is rejected at ingestion | **only this** |
| A required number arrives as a string and sums to zero | **only this** |
| An event is declared but nothing fires it | `analytics-coverage.test.ts` |
| A name is renamed or misspelled | the typed union, at build time |
| A required property is left out at a call site | the dev validator |

It does **not** check that an event fires at the right moment, or that the app
sends real values rather than the sentinels. It tests the pipeline, not the
call sites.

#### A `200` from Mixpanel means nothing

Probed against the live endpoint rather than assumed, because the whole design
turns on it:

| Sent with `strict=1` | Answer |
|---|---|
| no `token` property | 400, `status: 0`, "token, missing or empty" |
| no `event` name | 400, `status: 0`, "event, missing" |
| **a token belonging to no project** | **200, `status: 1`, `num_good_events: 1`** |
| no `distinct_id` | 200, `status: 1` |

Without `strict=1` even the first two answer `200` and the body `1`.

So `strict=1` catches a malformed event and nothing else. **Mixpanel accepts
events against a nonsense token and reports them as good.** The send step
therefore proves nothing on its own, and the read-back is not a nicety — it is
the entire test. Anyone later tempted to drop the polling and trust the 200
would turn this into a check that passes against a project that does not
exist.

`num_good_events` is compared against the batch size for the same reason: a
partial rejection still answers `status: 1`, and the event that fell out would
otherwise surface five minutes later as an unexplained "missing" with no
reason attached.

#### It cannot pass quietly

With no credentials the live run is skipped — and a second suite fails loudly
in its place, naming each missing variable and stating that none of the 62
events has been proved to reach Mixpanel. A skipped test that prints nothing is
how "we have a smoke test" becomes true on paper and false in practice.

#### Keeping test runs out of the numbers

Every smoke event carries `env: "smoke"`, `smoke_test: true`, `is_internal:
true`, a per-run `smoke_run_id`, and `distinct_id: "smoke-<runId>"`. Reports
exclude `env = "smoke"` the same way they exclude `env = "local"` — the same
filter covers both.

`$insert_id` is `<runId>-<event>`, so a CI retry of the same run deduplicates
server-side instead of doubling every count. The run id also keeps two
concurrent CI jobs from reading each other's events back, which the export
filter relies on.

#### Credentials

```
NEXT_PUBLIC_MIXPANEL_TOKEN      the project token — the same one the app reads
MIXPANEL_PROJECT_ID             numeric, for the export API
MIXPANEL_SERVICE_ACCOUNT_USER   needs export rights on that project
MIXPANEL_SERVICE_ACCOUNT_SECRET
```

The first is deliberately the variable the app itself uses: a smoke test run
against a different token than the app sends to would prove nothing about the
app. The last three are read-side only and match the names sole-ocr's
reporting pipeline already uses, so one service account covers both.

---

## NextTap removed, same as SolePay

By request, 8 Oct 2026. The three `nexttap_onboarding_*` events, the `track()`
calls in `use-step-form.ts` and `onboarding-screen.tsx`, and the names in the
contract are all reverted. Both payment-provider onboardings are now out until
each is called stable — see "SolePay is deliberately not instrumented" above,
which now applies to both.

## An old-project defect found during a second audit pass

A direct re-check of every defect in this document's opening table, against
the code as it stands — not a re-read, a re-derivation from the live app.

**`plan` was still reading from the wrong field.** `identify()` sent
`user?.plan`, and `AuthUser.plan` comes from the auth profile
(`user_details`), which carries no subscription information — it is
`undefined` for everyone, which is exactly the bug the old project shipped
with. `sole-webapp`'s own fix for this
(`components/Layout/Layout.js`, comment: *"user_details has no subscription on
it, so the old currentUser.plan was always undefined"*) reads the subscription
slice instead of the profile. The new UI had the equivalent data sitting right
there — `useSubscriptionStore`, already populated on every authenticated page
by `TopBar`'s `useSubscriptionQuery()` — and `AnalyticsBootstrap` simply wasn't
reading it.

Fixed: `lib/analytics.ts` now exports `derivePlan(subscription)`, returning
`'trial'` from `isTrialing`, `'free'` from `isFree`, `'paid'` otherwise, and
**`null`** — not `'free'` — before the subscription has loaded, so a paying
customer is never misreported for however long that fetch takes.
`AnalyticsBootstrap` reads `useSubscriptionStore` and re-identifies when it
changes, the same re-assertion pattern already used everywhere else in this
file. Five tests pin the derivation, including the "before it's loaded" case
specifically, since that is the exact shape of the original bug.

Everything else in the opening table was re-checked and holds: the identity
fallback, the UTM read timing, the typed contract, `is_internal`, the ABN and
cancellation-text exclusions, and the single call site for every funnel-entry
event (no `setup_business_profile_created`-style double trigger anywhere in
this codebase — `checkEmail`, `createBusinessApi` and every other funnel-step
call are each called from exactly one place).

## A senior-engineer pass found one real defect — the SDK could crash a save

11 Oct 2026, in response to "check all the files, kuch issue na ho, koi
feature brak na kre." Every modified file was re-read diff-by-diff — not
re-skimmed — against exactly that question, and one genuine, serious defect
turned up.

**`track()` and `identify()` called the Mixpanel SDK with no try/catch.** The
old project had this protection — `safeExecute()` in `sole-webapp`'s
`lib/mixpanel.js`, whose own comment reads *"App NEVER crashes due to
analytics"* — and this rewrite had dropped it. The risk was not theoretical:
`track()` is called from the middle of real business actions, strictly after
the backend confirmed success — `saveInvoiceApi` right after the invoice was
saved, `disposal-screen.tsx` right after `recordDisposal.mutateAsync`
resolved, both inside a `try { … } catch { toast.error(…) }` block. If the
SDK had thrown for any reason — a conflicting third-party script, an
extension half-loading it, a bug in `mixpanel-browser` itself — that
exception would have propagated out of `track()`, into the `catch` block, and
shown the person an error toast for a save that had already succeeded on the
server. This app instruments far more of the product's real money-moving
actions than the old one did, which makes the same gap more dangerous here,
not less.

Fixed: every one of the 14 raw `mixpanel.*` calls in `lib/analytics.ts` is now
wrapped in a `safely()` helper that swallows what it throws and logs in
development only. `identify()`'s internal `identifiedAs` latch is only set on
a successful call, so a transient SDK failure retries on the next render
instead of being wrongly marked done forever. 7 new tests in
`lib/analytics.test.ts` prove every exported function survives the SDK
throwing on every method at once — table-driven, so a future exported
function with no case in that table is a visible gap, not a silent one.

**Everything else held.** Every `track()` call site across all 33
instrumented files was read in full diff, not spot-checked: each one fires
strictly after its own success check (or, for the handful fired from a
component instead of a service — `invoice_paid`, `asset_disposed`,
`tax_estimator_used` — strictly after the mutation it reports already
resolved), none of them altered a return value or control-flow path, and the
one place a `track()` call sits right before a hard navigation
(`subscription-section.tsx`'s `window.location.href = url` after
`upgrade_intent`) is already safe: `mixpanel-browser` batches to localStorage
by default and flushes via `sendBeacon` on `pagehide`, with server-side
dedup on replay — confirmed by reading the SDK's own source
(`node_modules/mixpanel-browser/src/mixpanel-core.js`), not assumed.

## Where this stands

All four phases are built. 56 events, 60 call sites, 33 files; 1626 tests
pass, `tsc`, `eslint` and `next build` clean. Both SolePay and NextTap are out
by request until each module is stable.

**The project now exists: id `4071427`, token set in `.env`.** A manual probe
confirms Mixpanel's ingestion endpoint accepts the shape. That is **not**
proof the data is landing in this project — recall from Phase 4 above that a
token belonging to no project is accepted identically. Proof requires the
export-side credentials (`MIXPANEL_SERVICE_ACCOUNT_USER` /
`_SECRET`), which are not yet set, so `npm run test:smoke` still cannot run.
Until it does, nothing here has been verified against the live project —
check the Mixpanel Live View for project 4071427 for an event named
`page_view` or `manual_sanity_probe` as the fastest manual confirmation.

The honest summary: this is as verified as it can be without a project, and
not verified at all in the way that matters most.
