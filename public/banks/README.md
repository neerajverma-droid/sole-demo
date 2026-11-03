# Bank logos

Drop each file in here using exactly these names — `lib/banks.ts` points at them,
and anything missing falls back to that bank's brand tile rather than breaking:

| File                    | Bank               |
| ----------------------- | ------------------ |
| `nab.svg`               | NAB                |
| `commbank.svg`          | Commonwealth Bank  |
| `anz.svg`               | ANZ                |
| `anz-plus.svg`          | ANZ Plus           |
| `westpac.svg`           | Westpac            |
| `macquarie.svg`         | Macquarie Bank     |
| `amp.svg`               | AMP Bank           |
| `bank-of-melbourne.svg` | Bank of Melbourne  |
| `ing.svg`               | ING                |

The other eleven banks in the picker have no file yet, so they show their
`label`/`bg`/`fg` tile from `lib/banks.ts`. Add a file here and its path to that
record to upgrade one from initials to its real mark — nothing else changes, the
logo simply takes precedence over the tile.

Each is rendered in a `size-11 rounded-xl` tile with `object-contain p-1.5` on a
`bg-muted` backing — see `LOGO_TILE` and `LOGO_IMAGE` in
`components/transactions/bank-logo.tsx`, which the Sole mark on the consent
screen shares. Square roundels and wide wordmarks both fit, and a
white-on-transparent mark stays visible. Prefer SVG with a transparent
background and no fixed `width`/`height` attributes.

## Before production

**These are third-party trademarks** — and so are the brand colours and
abbreviations on the fallback tiles. Both are used here only to build and
demonstrate the connect flow. A tile carrying a bank's initials in its own brand
colours is still brand usage and needs the same clearance as the logo: written
permission from each brand, or compliance with their published brand guidelines.
Several Australian banks restrict third-party use outright. Until that sign-off,
treat this directory and the `bg`/`fg` values in `lib/banks.ts` as placeholders.
