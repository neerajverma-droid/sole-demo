---
paths:
  - "components/auth/accountant-invite-screen.tsx"
  - "components/auth/register-screen.tsx"
  - "components/onboarding/company-profile-step.tsx"
  - "app/(auth)/accountant-invite/**"
  - "app/(auth)/auth/activate/**"
  - "app/(admin)/admin/partners/**"
  - "components/admin/partners/**"
  - "lib/spm-referral*"
  - "lib/partner-referral*"
  - "lib/subscription*"
  - "components/settings/**/subscription*"
  - "config/api-routes.ts"
  - "lib/api/routes.ts"
---

# Partner referral feature: web app rules

Design: `partner-referral-lld.pdf` (repo root). Plan: `sole-ocr/docs/partner-referral/PLAN.md`.

## Naming
- In this app, "partner" already means an in-Sole accountant ("The partner sign-in"). For external systems like SPM, write **"integration partner"** in UI copy and code comments.
- New code uses `partner-referral` / `partnerReferral`, not `spm-referral`. The old `lib/spm-referral.ts`, `/spm-referral/*` routes and the `spm_referral` field keep working until the backend removes them.

## Security invariants
- An invite link is a prefill, never a fact. Attribution, trust and accountant access are decided by the backend only.
- Don't decrypt partner data in the browser for new flows. Use `?token=` and fetch the prefill from `GET /partner-referral/invite/:token`. `NEXT_PUBLIC_SECRET_KEY` is public, so it protects nothing.
- Never send `accountant_email` / `has_accountant_email` from an invite's URL fields to grant access. The backend grants access from its own invite record.
- Accountant-paid plans: when the API returns 403 `managed_by_payer`, show "Managed by your accountant" with "Request a change" (`POST /subscription/request-change`) and "Pay for this myself" (takeover). Never show the payer's email, card or Stripe ids to the client; `paid_by` for clients has only `name`.
- Super-admin partner pages: show a partner's secret key **once**, at creation or rotation, and never store it in client state or logs.

## Conventions
- API routes go in `config/api-routes.ts` (legacy services) or `lib/api/routes.ts` (new client). Don't add new copies in both.
- Admin pages use the existing shell and the `partners` feature grant (`lib/admin/access.ts` `PLATFORM_FEATURE_KEYS`).
- Use Vitest tests next to the lib (`*.test.ts`) for parsing and state logic. Never use a real token or email in fixtures.
