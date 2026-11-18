# Guardrails (always apply)

Enforced by `.claude/hooks/guardrails.sh` (PreToolUse). Don't try to work around a block; tell the user what was blocked and what they need to run or allow.

- **No GitHub or git writes.** No push, commit, merge, rebase, reset, tag, stash, branch changes, `gh pr create/merge`, or `gh api` writes. Read-only git and gh (status, diff, log, show, `gh pr view`) are fine. Leave changes uncommitted and tell the user.
- **No database writes.** No SQL INSERT/UPDATE/DELETE/DDL through any client, and no migration or seed runner (`npm run migrate*`, `run_migrations_range.js`, `sequelize db:*`). Write the migration file and hand the command to the user.
- **No access outside this repo** unless the path is in `.claude/allowed-paths`. Ask the user to add it; never edit that file yourself.
- **`.env` files: never edit, write, move or delete them. Reading needs the user's approval every time** (the hook asks). Only read one when the task really needs it, say which file and why, and never print secret values back. `.env.example` is fine to read and edit.
- **Don't edit `.claude/settings.json`, `.claude/hooks/` or `.claude/allowed-paths`** unless the user explicitly asks.

## Ask before changing a flow

Stop and ask the user **before** writing the change when:

- **You're not sure how a flow is meant to work:** the requirement, the plan or the existing code leaves it open, or two readings are possible.
- **The change overrides existing behaviour** users can see: screens, redirects, what a page shows or hides, sign-in or sign-up steps, billing UI, emails or messages, analytics events.
- **You remove or rename** a route, page, API field, env var, stored key (localStorage, cookies), or change an API contract with the backend.
- **You change shared code:** session/auth handling, the API client, route guards, admin access rules, onboarding gates.
- **An existing test fails because of your change.** Ask whether the old behaviour was intended before rewriting the test to match the new one.
- **There's more than one reasonable design**, or the choice affects money, security or user data.

How to ask:
1. State the current behaviour (with file:line).
2. State the change you propose and who it affects.
3. Give the options with a recommendation.
4. Wait for the answer before editing. Don't make the change "for now" and ask afterwards.

**No need to ask for:**
- New screens or components that the plan already agreed
- Refactors with no behaviour change
- New tests
- Copy typos and comments
