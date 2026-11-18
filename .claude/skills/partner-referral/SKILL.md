---
name: partner-referral
description: Work on the integration-partner referral feature in the Sole web app — accountant invite page, account activation, accountant-paid billing UI, super-admin Partners pages. Use when touching accountant-invite, activate, register with an invite, paid_by / managed_by_payer billing UI, or /admin/partners.
---

# Partner referral (web app)

## Before you start
1. Read `.claude/rules/partner-referral.md` (loaded automatically for the feature's files) and `.claude/rules/guardrails.md`.
2. Find the current phase in the plan: `sole-ocr/docs/partner-referral/PLAN.md`. Reading the backend needs `/Users/csp/Desktop/soleapp/sole-ocr` in `.claude/allowed-paths`. If it's missing, ask the user to add it.
3. Check the backend endpoint exists before building UI against it. If it doesn't, stop and say which phase it belongs to.

## Building a screen
1. API route → `config/api-routes.ts` or `lib/api/routes.ts` (one place).
2. Data layer in `lib/partner-referral.ts` (parse + typed results). Map backend errors to plain sentences, the way `lib/referral.ts` translates `already_sent`.
3. Hook in `hooks/` with TanStack Query, and invalidate the right keys after writes.
4. Screen in `components/...`, page in `app/...` (wrap in `Suspense` if it reads search params).
5. Vitest for the lib: invalid token, expired, wrong partner, `managed_by_payer`.

## Before editing existing behaviour
Follow "Ask before changing a flow" in `.claude/rules/guardrails.md`. If a screen, redirect, sign-in step, billing UI or API contract that users already rely on would change, or an existing test starts failing, ask the user first.

## Checks before handing back
- Every change to existing behaviour was asked about and approved before editing.
- `npx vitest run <changed tests>` passes, and `npx tsc --noEmit` shows no new errors in the touched files.
- No secret, token or partner key in logs, state, URLs (except the one invite `token`) or tests.
- The client never sees the payer's private details.
- Leave everything uncommitted; summarise the files changed and what the user needs to run.
