# Testing: Clients & Contacts

Reference for test coverage of the Clients & Contacts module: the Contacts
screen (`app/(app)/contacts/page.tsx` → `components/contacts/*`), its real API
layer, the pure form/people helpers every client picker in the app shares,
and the two lighter "pick or add a client/supplier" lists other modules read
from. All four test files below are **pre-existing** — built by the wider
team across earlier commits on `feat/api-integration`, described here for
completeness, not claimed as new work.

All files are Vitest unit tests: no browser, no rendering, plain `node`
environment (`vitest.config.ts`), and the same mocked-`@/utils/axiosInstance`
convention (`apiMock` + `vi.mock` + dynamic `await import(...)`) used across
`lib/*.test.ts`. For copy-pasteable templates see "Writing a new test in this
codebase" in [`testing-coverage.md`](./testing-coverage.md) — not repeated
here.

**The one thing to know before reading any of this code** — a *client* and a
*contact* are two different records in two different id spaces:

| Concept | What it is | Backend table / route | Id field in this app |
|---|---|---|---|
| Client (or supplier) | A company/business — or an Individual, which is still a client row with no business name | `clients`, `/client` | `Contact.id`, `BusinessContact.id`, `CompanyContact.clientId`; wire `client_id` (or `id` on `/client/v2` rows) |
| Contact person | One person at that company; a client has one or more, exactly one `is_primary` | `contacts`, `/contact` | `ContactPerson.id`, `ContactFormValues.personId`, `BusinessContact.primaryContactId`, `CompanyContact.contactId`; wire `contact_id` / `primary_contact` |

The naming is inverted in two places and is the easiest trap here:

- What the **UI calls a "Contact"** (`type Contact`, the Contacts screen) is
  the *company* record. `lib/contacts-api.ts` says so in its header: *"What
  the UI calls a 'Contact' is a company/business record, backed by the
  `/client` REST resource."*
- `apiRoutes.contact.*` resolves to **`/client`** routes;
  `apiRoutes.companyContact.*` resolves to the **`/contact`** (person)
  routes. And `apiRoutes.client.listV2` is `/client` while
  `apiRoutes.contact.list` is `/client/v2`.

Every test in this module that maps an id asserts which space it came from —
see `primaryContactId` in `lib/clients.test.ts` and `contactId`/`clientId` in
`lib/company-contacts.test.ts`.

## Running them

```bash
npx vitest run lib/clients.test.ts lib/contacts.test.ts \
  lib/contacts-api.test.ts lib/company-contacts.test.ts   # this module (99)
npx vitest run lib/contacts-api.test.ts                   # one file
```

Current as of this doc: **1285 tests pass repo-wide**; the 99 in this module
are itemised below.

| File | Tests | Covers |
|---|---|---|
| `lib/contacts-api.test.ts` | 40 | The Contacts screen's real API: tab list/counts, detail, create, update-with-people-reconciliation, delete, bulk create |
| `lib/contacts.test.ts` | 37 | Pure helpers: `contactSchema` validation, primary/people normalisation, combobox matching, display/CSV helpers |
| `lib/clients.test.ts` | 18 | `fetchBusinessContacts` / `createBusinessContactApi` — the per-client pick-or-add list used outside the Contacts screen |
| `lib/company-contacts.test.ts` | 4 | `fetchCompanyContacts` — per-person list; documented in `testing-coverage.md` (Expenses) |

---

## Test files

### `lib/contacts-api.test.ts` (40 tests)

Uses a `decryptedFieldsFromBody` helper that runs `decryptPayload` from
`@/utils/encrypt` on the `{data}` envelope, so every write assertion is
against the real decrypted field set, not just "something was posted". It
also throws if a body isn't a bare `{data}` envelope — confirming no Contacts
write ever goes as `FormData`.

- **`fetchContactsPage` (12)** — tab → params: Client sends `type: "1"`,
  Supplier `type: "2"`, Default sends `filter_by[scope]: "default"` and *no*
  `type` at all; `page`/`limit` go as strings; `searchQuery` is trimmed and
  omitted entirely for a blank/whitespace search. Row mapping: primary
  contact's name/phone/calling code are flattened onto the `Contact`, the
  row's own `email` wins over the primary's. Then the regressions:
  - **`created_at` date bug** — the server sends `DD-MM-YYYY`;
    `new Date("17-09-2026")` is Invalid Date (blank column) and
    `new Date("05-09-2026")` silently reads as 9 May. Two tests pin both
    (`"17 Sept 2026"`, `"05 Sept 2026"`).
  - Default tab marks every row `isDefault: true`.
  - `type` is `"Supplier"` only for that literal string; `null`/anything
    else → `"Client"`.
  - `businessType` derived from presence of `business_name` (the list row has
    no `company_type`).
  - `total` falls back to `rows.length` without `pagination.total`; an empty
    `{}` response gives `{contacts: [], total: 0}`.
- **`fetchContactTabCounts` (2)** — exactly two `limit=1` calls (one plain,
  one `filter_by[scope]=default`) in parallel; clients/suppliers come from the
  plain call's `meta.total_clients`/`meta.total_suppliers`, default from the
  scoped call's `pagination.total`. All three default to `0`.
- **`fetchContactDetail` (3)** — `GET ${contact.getDetails}/{id}`; company
  fields + `people[]` with their real `/contact` ids and `is_primary` read as
  a flag; falls back to the first person as the flat primary when none is
  flagged; throws `"Contact not found"` on no `data`.
- **`createContactApi` (5)** — one encrypted POST carrying company fields
  *and* `contacts[]` (primary `is_primary: 1` first, then additional people
  `is_primary: 0`), numeric `type: 2` for Supplier; an Individual sends only
  the primary and `company_type: "individual"`; returned `Contact` carries
  the server id and `isDefault: false`; throws the server message on
  `success:false`, and `"The contact saved but the server returned no id."`
  on success without an id.
- **`updateContactApi` (6)** — the most important group. The company PATCH
  carries **no `contacts` array** (the update endpoint doesn't accept one);
  people are then reconciled against `originalPeople`:
  - nothing changed → exactly one PATCH (the company), no POST/DELETE;
  - a changed person → second PATCH to `${companyContact.update}/11`;
  - a person with no id → POST to `companyContact.create` with
    `client_id: "501"` attached;
  - a person in `originalPeople` but missing from the submission → DELETE
    `${companyContact.delete}/11` with an encrypted empty body;
  - a failed company PATCH throws the server message and **no person call is
    made at all**.
- **`deleteContactApi` (2)** — DELETE `${contact.delete}/{id}` with
  `{data: buildEncryptedRequestBody({})}` as the axios config (decrypts to
  `{}`); surfaces the server message (`"Contact has open invoices"`).
- **`bulkCreateContactsApi` (10)** — `{type: "upload", file_data}` to
  `client.bulkInsert`; rows mapped to the backend's Title-Case keys via
  `contactPayloads` (`"Business Name"`, `"Mobile No"`, numeric `Type` 1/2,
  `Currency` defaulting to AUD, a mapped Currency/Website winning). Result
  counting:
  - `meta` present → counts read from it, `skipped` kept apart from `failed`;
  - no `meta` → counted from the per-row log, whose statuses are
    `success`/`skipped`/`failed` (not `"created"`, which is `meta`'s word);
  - an unrecognised row status (`"exploded"`) counts as **failed**, never
    success;
  - neither `meta` nor a log → every submitted row counted as created;
  - the per-row log is passed through as `rows` for the results dialog;
  - `[]` throws `"File is empty"` **without posting**; `success:false`
    throws the server message.

### `lib/contacts.test.ts` (37 tests)

No API mocking — every export here is pure.

- **`phoneLengthsFor` / `digitsOnly` (3)** — per-country lengths (`+61` →
  `[9]`, `+64` → `[8, 9]`), unknown code → `[7, 8, 9, 10]`.
- **`contactSchema` (11)** — a complete Business and a complete Individual
  (blank business name) both pass; business name `< 2` chars fails only for
  Business; contact name `< 2` fails; email checked against `EMAIL_PATTERN`;
  ABN and phone checked **only once non-blank** (phone against the chosen
  country's lengths — `+64` with 8 digits passes); an Individual carrying
  `additionalContacts` is rejected; each additional person's own
  name/email/phone issues land at `additionalContacts.0.<field>` paths; an
  additional person with no email or phone at all is valid;
  `contactPersonSchema` carries an optional `id`.
- **`primaryContactPerson` / `contactPeople` (4)** — no `people` list → one
  synthesised primary from the flat fields; a stored list where the second
  person is flagged primary is reordered primary-first with everyone else
  demoted; a list with **no** one flagged gets the synthesised flat primary
  prepended, ahead of the (demoted) stored people.
- **`composeContactPeople` (4)** — Individual → only the trimmed primary;
  Business → primary first, additional people trimmed and forced
  `isPrimary: false`; `personId` travels as the primary's `id`; additional
  people keep their own `id` (what `updateContactApi` reconciles on).
- **Combobox/display (11)** — `contactDisplayName` (business name, else person
  name); `matchContacts` (blank query → all; case-insensitive over display
  name + email); `exactContactMatch` (whole-name, case-insensitive; blank or
  partial → `undefined`); `clientCreateLabel` (`Create "Acme"` / `"Add new
  client"`); `contactInitials` (first two words, `"?"` for empty);
  `formatPhone` (**no country-code prefix**, `"—"` when blank).
- **CSV/type helpers (4)** — `splitCsvLine` (plain commas, a quoted comma,
  `""` unescaping); `canonicalContactType`/`canonicalBusinessType` normalise
  casing and return `""` for anything else (`"vendor"`, `"company"`).

### `lib/clients.test.ts` (18 tests)

`lib/clients.ts` is the lightweight per-*client* list (not the Contacts
screen) that pickers such as the matching-rule form's client/supplier field
and `components/documents/new-business-contact-dialog.tsx` use.

- **`fetchBusinessContacts` (8)** — `GET client.listV2` with exactly
  `{page_size: 100, "filter_by[type]": "client"|"supplier",
  "filter_by[scope]": "all"}` (`scope=all` merges in the `user_id = 0`
  global defaults); full row mapping with `business_name` preferred over
  `name` and the address joined as `line1, city, state, country`;
  **`primary_contact` read as `primaryContactId`, a different id space from
  `client_id`**; blank fields default to `""`/`null` rather than throwing;
  missing `clients_details` → `[]`.
- **`createBusinessContactApi` (10)** — POST `client.add` with a **plain,
  unencrypted** body (the test title says so explicitly):
  `{name, email, type: 1|2, contacts: [{name, email, is_primary: 1}]}`;
  missing email → `""` on both the client and the contact; id resolved from
  `client_id`, falling back to `id`; `primaryContactId` from
  `data.primary_contact`; returned email trimmed; server message surfaced,
  else a type-worded fallback (`"Couldn't add that supplier."`); success with
  no id throws `"The client saved but the server returned no id."`.

### `lib/company-contacts.test.ts` (4 tests)

`fetchCompanyContacts` — the per-*person* list (`GET /contact/list`) behind
the expense form's Supplier field. Fully documented, with its contract row,
in the Expenses section of [`testing-coverage.md`](./testing-coverage.md);
in short: `type` 1/2 + `filter_by[scope]=all`, `contact_id` vs `client_id`
mapped as distinct ids, business-name-or-contact-name `clientName`, rows with
no `client_id` dropped.

---

## Real contract — `lib/contacts.ts`

**Types** (verbatim, doc comments trimmed):

```ts
export type ContactType = "Client" | "Supplier";
export type BusinessType = "Business" | "Individual";

export type ContactPerson = {
  /** The server's own id for this person (a `/contact` row), absent for one
   *  added in the drawer this session and not yet saved. */
  id?: string;
  personName: string; email: string; countryCode: string; phone: string;
  division: string; position: string; isPrimary: boolean;
};

export const EMPTY_CONTACT_PERSON: ContactPerson = {
  personName: "", email: "", countryCode: "+61", phone: "",
  division: "", position: "", isPrimary: false,
};

export type Contact = {
  id: string;               // the CLIENT (company) id
  /** Empty for an Individual — the person's name is then the display name. */
  businessName: string;
  personName: string; email: string; countryCode: string; phone: string;
  abn: string; website: string; currency: string; division: string;
  position: string; addressLine1: string; city: string; country: string;
  notes: string; isPrimary: boolean; type: ContactType;
  businessType: BusinessType; created: string;
  /** Everyone at this contact, primary first. Optional — never read this
   *  array directly; `contactPeople` is the accessor. */
  people?: ContactPerson[];
  /** A global, unowned record (`user_id = 0`) surfaced only by the "Default"
   *  tab. Read-only: no edit or delete affordance is ever offered. */
  isDefault: boolean;
};

export const CONTACT_TABS = ["Client", "Supplier", "Default"] as const;
export type ContactTab = (typeof CONTACT_TABS)[number];

export const EMAIL_PATTERN = /.+@.+\..+/;
export type ContactFormValues = z.infer<typeof contactSchema>;
// = the Contact's flat fields (minus id/created/people/isDefault) plus
//   personId?: string and additionalContacts: ContactPerson[]
```

`COUNTRY_CODES` (`+61` [9], `+64` [8, 9], `+1` [10], `+44` [10], `+65` [8],
`+91` [10]) and `CURRENCIES` (AUD/NZD/USD/GBP) are the drawer's option lists.
`contactFormDefaults`: `type: "Client"`, `businessType: "Business"`,
`countryCode: "+61"`, `currency: "AUD"`, `isPrimary: true`, everything else
blank. `EMPTY_CONTACT_FORM` is a deprecated alias kept for the vendored
`sole-project` snapshot.

**Pure functions** (signature + the one non-obvious rule each has):

- `phoneLengthsFor(countryCode): number[]` — unknown code → `[7, 8, 9, 10]`.
- `digitsOnly(value): string` — strips `\D`.
- `contactSchema` (zod `superRefine`) — business name `>= 2` chars only when
  `businessType === "Business"`; person name `>= 2` always; email must match
  `EMAIL_PATTERN` (**required on the primary, optional on additional people**
  — only checked once non-blank); ABN must be 11 digits once typed (message
  includes the typed count: `` `ABN must be 11 digits (you entered ${n}).` ``);
  phone checked against `phoneLengthsFor` of **that row's own**
  `countryCode`; an Individual with any `additionalContacts` fails at path
  `["additionalContacts"]` (`"An individual can only have one contact
  person."`) and skips per-row checks.
- `contactDisplayName(contact)` — `businessName || personName`.
- `primaryContactPerson(contact)` — the flat fields as a `ContactPerson`,
  `isPrimary: true`, **no `id`**.
- `contactPeople(contact)` — primary first, exactly one primary. The first
  stored person flagged primary leads; with none flagged, the flat primary
  is synthesised and prepended; everyone else demoted, order kept.
- `composeContactPeople(values)` — `isPrimary` **forced** (true for the flat
  primary, false for every additional person) rather than trusted from the
  form; name/email trimmed; Individual → primary only.
- `matchContacts(contacts, query)` — substring over
  `` `${displayName} ${email}` `` lowercased; blank query returns the input.
- `exactContactMatch(contacts, query)` — whole display-name equality only
  (email is not considered).
- `clientCreateLabel(query)`, `contactInitials(name)` (first letters of up to
  two words, uppercased, `"?"` fallback), `formatPhone(contact)` (`phone ||
  "—"`).
- `splitCsvLine(line)` — quote-aware; cells trimmed.
- `canonicalContactType(value)` / `canonicalBusinessType(value)` — trimmed,
  case-insensitive; `""` when unrecognised.

## Real contract — `lib/contacts-api.ts`

**Types** (verbatim):

```ts
export type ContactsPage = { contacts: Contact[]; total: number };

type ApiContactRow = {
  id: string | number;            // client id
  business_name?: string | null; email?: string | null;
  type?: string | null;           // "Client" | "Supplier" as a STRING here
  created_at?: string | null;     // DD-MM-YYYY
  notes?: string | null;
  primary_contact?: { name?; email?; country_calling_code?; phone_number? } | null;
  address_line1?: string | null; city?: string | null; country?: string | null;
};

type ApiContactListResponse = {
  success?: boolean;
  data?: ApiContactRow[];
  meta?: { all?: number; total_clients?: number; total_suppliers?: number };
  pagination?: { total?: number };
};
```

**Mapping rules worth knowing** (internal, not exported):

- `formatContactCreated(raw)` — parses `DD-MM-YYYY` by hand (see the date
  regression above), else `new Date(raw)`; formats `en-AU`
  `{day: "2-digit", month: "short", year: "numeric"}` (`"17 Sept 2026"`);
  `""` for blank/unparseable.
- `cleanAddressField(value)` — strips a literal `Optional("…")` wrapper some
  `address` rows were saved with (an iOS client stringifying a Swift
  optional). **Untested** — see Gaps.
- `mapApiContactRow` — list rows carry no ABN/website/division/position (set
  `""`) and no currency (hard-set `"AUD"`); `isPrimary: true`;
  `businessType` from presence of `business_name`.
- `fetchContactDetail`'s mapper — `businessType` is `"Individual"` only for
  `company_type === "individual"`; `currency || "AUD"`; `state`/`postcode`
  are typed on `ApiContactDetail` but **not mapped** onto `Contact`;
  `is_primary` via `parseFlag` (`!!v && v !== "0"`); `created: ""`.
- `contactCompanyWriteFields(values)` — `business_name`, `website`, `ABN`,
  `notes`, `currency`, `address_line1`, `country`, `city` (trimmed),
  `company_type: "individual"|"business"`, `type: 2|1` (numeric).
- `contactPersonWriteFields(person)` — `name`, `email` (trimmed),
  `division`, `position`, `is_primary: 1|0`, `phone_number`,
  `country_calling_code`.
- `contactPersonChanged(a, b)` — compares the seven editable fields
  (including `isPrimary` and `countryCode`); `id` is not compared.

**Real API calls** (`BASE_URL` = `process.env.NEXT_PUBLIC_SOLE_OCR_URL ??
"http://localhost:3001/api"`):

| Function | Method | Route | Body / params | Response envelope | Notes |
|---|---|---|---|---|---|
| `fetchContactsPage(tab, page, pageSize, search): Promise<ContactsPage>` | GET | `apiRoutes.contact.list` → `/client/v2` | `{page: String, limit: String, searchQuery?: trimmed, type: "1"\|"2"}` or, for Default, `filter_by[scope]: "default"` instead of `type` | `ApiContactListResponse` | Never checks `success`. `total` = `pagination.total ?? rows.length`. |
| `fetchAllContacts(): Promise<Contact[]>` | GET | same | Client-tab params, `page: "1"`, `limit: "1000"` | same | Client tab only (no suppliers/defaults) — feeds "Where your customers are" / Geographic Insights. **Untested.** |
| `fetchContactTabCounts(): Promise<{clients, suppliers, default}>` | GET ×2 | same | `{page: "1", limit: "1"}` and `{page: "1", limit: "1", "filter_by[scope]": "default"}`, via `Promise.all` | same | `Number(... ?? 0)` for each counter; no `success` check. |
| `fetchContactDetail(id): Promise<Contact>` | GET | `` `${apiRoutes.contact.getDetails}/${id}` `` → `/client/{id}` | — | `{success?, data?: ApiContactDetail}` | Throws `"Contact not found"` if no `data` (presence, not `success`). Only call that returns `people[]` with real `/contact` ids. |
| `createContactApi(values): Promise<Contact>` | POST | `apiRoutes.contact.create` → `/client` | `buildEncryptedRequestBody({...companyFields, contacts: composeContactPeople(values).map(personFields)})` | `{success?, message?, data?: {id?}}` | Throws `message \|\| "Failed to create contact."` only on `success === false` (a missing flag counts as success); then `"The contact saved but the server returned no id."` if `data.id == null`. Backend creates client + child contacts in one transaction. |
| `updateContactApi(id, values, originalPeople): Promise<void>` | PATCH | `` `${apiRoutes.contact.update}/${id}` `` → `/client/{id}` | `buildEncryptedRequestBody(companyFields)` — **no `contacts`** | `{success?, message?}` | Throws `message \|\| "Failed to update contact."`. Then, in one `Promise.all`: DELETE removed people, PATCH changed ones (or ones whose id isn't in `originalPeople`), POST new ones — see the three person rows below. |
| ↳ `createContactPersonApi` (internal) | POST | `apiRoutes.companyContact.create` → `/contact` | `buildEncryptedRequestBody({...personFields, client_id})` | `{success?, message?}` | Throws `message \|\| "Failed to add a contact person."`. |
| ↳ `updateContactPersonApi` (internal) | PATCH | `` `${apiRoutes.companyContact.update}/${personId}` `` → `/contact/{id}` | `buildEncryptedRequestBody(personFields)` | same | Throws `message \|\| "Failed to update a contact person."`. |
| ↳ `deleteContactPersonApi` (internal) | DELETE | `` `${apiRoutes.companyContact.delete}/${personId}` `` → `/contact/{id}` | `{data: buildEncryptedRequestBody({})}` | same | Throws `message \|\| "Failed to remove a contact person."`. |
| `deleteContactApi(id): Promise<void>` | DELETE | `` `${apiRoutes.contact.delete}/${id}` `` → `/client/{id}` | `{data: buildEncryptedRequestBody({})}` | `{success?, message?}` | Throws `message \|\| "Failed to delete contact."`. |
| `bulkCreateContactsApi(rows: BulkRow[]): Promise<BulkImportResult>` | POST | `apiRoutes.client.bulkInsert` → `/client/bulk/create` | `buildEncryptedRequestBody({type: "upload", file_data: contactPayloads(rows)})` | `{success?, message?, data?: [{row?, status?, identifier?, message?}], meta?: {total?, created?, skipped?, failed?}}` | `[]` → throws `"File is empty"` before any request. `success` stays `true` for every per-row outcome; only a request-level failure is `false` → `message \|\| "Failed to import contacts."`. Count precedence: `meta` → per-row log → "all created". |

Every non-GET here goes through `buildEncryptedRequestBody` with no files,
so the wire body is always the bare `{data: "<AES string>"}` envelope.

`contactPayloads`/`contactPayload` and `CONTACT_IMPORT_SPEC` live in
`lib/contact-import.ts` and are covered by `lib/module-imports.test.ts`
("contact import") — documented with the Migrations/bulk-import module, not
here. `lib/contacts-api.test.ts` exercises them only indirectly through
`bulkCreateContactsApi`.

## Real contract — `lib/clients.ts`

```ts
export type BusinessContact = {
  id: string;                       // client_id
  name: string;
  email: string;
  /** Absent or AUD means no conversion is on offer for this one. */
  currency: DocumentCurrency | null;
  abn: string;
  address: string;
  /** The id of this client/supplier's primary *contact* row — a different
   *  id space than `id` above. */
  primaryContactId?: string | null;
};
```

| Function | Method | Route | Body / params | Response envelope | Notes |
|---|---|---|---|---|---|
| `fetchBusinessContacts(type): Promise<BusinessContact[]>` | GET | `apiRoutes.client.listV2` → `/client` | `{page_size: 100, "filter_by[type]": "client"\|"supplier", "filter_by[scope]": "all"}` | `{success, data?: {clients_details?: ApiClientRow[]}}` | No `success` check, defaults `[]`. **Hard cap of 100 rows**, no paging. `currency` via `normaliseCurrency` from `lib/invoices`. Address omits `address_line2`/postcode. |
| `createBusinessContactApi(type, {name, email?}): Promise<BusinessContact>` | POST | `apiRoutes.client.add` → `/client/` (trailing slash) | **Plain JSON, not encrypted**: `{name, email: email ?? "", type: 1\|2, contacts: [{name, email, is_primary: 1}]}` | `{success, message?, data?: {client_id?, id?, primary_contact?}}` | Throws `message \|\| "Couldn't add that client/supplier."` if `success === false \|\| !data`; `"The client/supplier saved but the server returned no id."` if neither `client_id` nor `id`. Returned `name` is not trimmed, `email` is; `currency: null`, `abn`/`address` blank. |

Note the type encoding differs on every endpoint in this module:
`/client` list takes `filter_by[type]=client|supplier`, `/client/v2` takes
`type=1|2` as a string and returns `type` as `"Client"|"Supplier"`,
`/contact/list` takes numeric `type` 1/2, and every write sends numeric 1/2.

`createBusinessContactApi` is the one non-GET in this module that is **not**
wrapped in `buildEncryptedRequestBody`, and its test asserts the plain body
as-is. That's a divergence from the repo's encrypt-every-non-GET convention,
recorded here as current behaviour, not a fix. Its sibling
`createInvoiceClientApi` (`lib/invoice-clients.ts`) posts to the same route.

## Stores

### `stores/contacts.ts` — no test file; audited, nothing to add

`useContactsStore` holds whichever `fetchContactsPage` page (or the
`fetchAllContacts` book) is on screen, mirrored in by
`hooks/use-contacts-query.ts`. It is one setter plus `hydrated`, the same
shape as `stores/rules.ts`:

```ts
export const useContactsStore = create<ContactsState>()((set) => ({
  contacts: [],
  hydrated: false,
  setContacts: (contacts) => set({ contacts, hydrated: true }),
}));
```

No guard, dedupe or fallback lives here. The only list logic is in callers,
e.g. `components/documents/new-client-dialog.tsx` prepending a freshly
created contact with `setContacts([contact, ...getState().contacts])`
without deduping. That's component code, not store code. A store test would
only re-assert Zustand's `set`.

### `hooks/use-contacts-query.ts` — no test file

React Query wrappers (`["contacts", tab, page, pageSize, search]` with
`keepPreviousData`, `["contacts", "all-clients"]`, `["contacts", "counts"]`,
`["contacts", "detail", id]` enabled only with an id), and four mutations
that all invalidate the whole `["contacts"]` prefix on success. Pure wiring
with no branching, and it needs a React renderer the repo doesn't have
(see "What this repo doesn't have" in `testing-coverage.md`).

---

## Gaps

Nothing below has any test coverage today:

- **`fetchAllContacts`** (`lib/contacts-api.ts`) — never called by any test.
  Its `limit: "1000"` and Client-only params feed the dashboard's customer
  areas.
- **`cleanAddressField`'s `Optional("…")` unwrapping** — no list fixture
  carries an address, so neither the unwrap nor the plain-value pass-through
  is pinned.
- **`fetchContactDetail` branches** — `company_type: "individual"` →
  `"Individual"`, the `currency || "AUD"` fallback, `parseFlag` on the
  string `"0"`, and the fact that `state`/`postcode` are dropped.
- **`updateContactApi` partial failures** — none of the three person-level
  throw messages is tested, and neither is the non-atomic outcome. The
  company PATCH has already landed when a person call fails, and
  `Promise.all` rejects on the first failure while the others keep running.
  Also untested: a submitted person whose `id` is not in `originalPeople`
  (the `!original` → PATCH branch), and a changed *primary* (only an
  additional person's change is tested).
- **Fallback error messages** — `"Failed to create contact."`, `"Failed to
  update contact."`, `"Failed to delete contact."`, `"Failed to import
  contacts."` (only the server-message path is tested for each).
- **`createContactApi`'s returned `Contact`** — only `id`/`isDefault` are
  asserted. The Individual → `businessName: ""` rule and the locally
  formatted `created` date are not.
- **`contactSchema` error copy** — tests assert `success`/`path` only, never
  the message strings (e.g. the ABN count message, the per-country phone
  message, the Individual additional-contacts message).
- **`contactPeople` with two stored primaries** — the "first flagged wins,
  the rest demoted" rule is only tested with one flag.
- **`withPrimaryFirst`** (`components/contacts/contact-drawer.tsx`, not
  exported) — the primary-swap that moves the chosen person into the flat
  fields and carries both `id`s across (`personId` ↔ the demoted person's
  `id`). A wrong swap here would make `updateContactApi` create a duplicate
  person or delete a real one. It's the strongest candidate for the
  export-and-test-the-pure-function convention.
- **`stores/contacts.ts`, `hooks/use-contacts-query.ts`, every
  `components/contacts/*.tsx`** (including `Highlight`'s match-splitting) —
  no tests, as discussed above.
- **`lib/customer-areas.ts`** — contact-consuming (it joins
  `invoice.clientId` against `Contact.id`, a client id, and groups by
  `Contact.city`/`country`) but has **no test file**: `areaLabelFor`,
  `customerAreas`, `areaPredicate`, `areaState`, `areaDisplayName`,
  `customerAreaDetail`, `isAreaLevel`, `areaLevelLabel`. State/postcode
  grouping relies on hard-coded `SAMPLE_STATES`/`SAMPLE_POSTCODES` lookups,
  so an unknown city falls into `"Unspecified location"`.
- **`lib/invoice-clients.ts`** (adjacent, Invoices-owned) — no test file;
  only its `InvoiceContact` type is imported by
  `hooks/use-bulk-transaction-parties.test.ts`.

---

## Route resolution quick reference

`BASE_URL = process.env.NEXT_PUBLIC_SOLE_OCR_URL ?? "http://localhost:3001/api"`
(tests assert against the `apiRoutes.x.y` constant from `@/config/api-routes`,
never the literal path).

| Constant | Resolves to |
|---|---|
| `apiRoutes.contact.list` | `BASE_URL + "/client/v2"` |
| `apiRoutes.contact.getDetails` | `BASE_URL + "/client"` (`/{id}` appended) |
| `apiRoutes.contact.create` | `BASE_URL + "/client"` |
| `apiRoutes.contact.update` | `BASE_URL + "/client"` (`/{id}` appended) |
| `apiRoutes.contact.delete` | `BASE_URL + "/client"` (`/{id}` appended) |
| `apiRoutes.companyContact.list` | `BASE_URL + "/contact/list"` |
| `apiRoutes.companyContact.create` | `BASE_URL + "/contact"` |
| `apiRoutes.companyContact.update` | `BASE_URL + "/contact"` (`/{id}` appended) |
| `apiRoutes.companyContact.delete` | `BASE_URL + "/contact"` (`/{id}` appended) |
| `apiRoutes.client.listV2` | `BASE_URL + "/client"` (despite the name; `contact.list` is the `/v2` one) |
| `apiRoutes.client.add` | `BASE_URL + "/client/"` (trailing slash) |
| `apiRoutes.client.bulkInsert` | `BASE_URL + "/client/bulk/create"` |
