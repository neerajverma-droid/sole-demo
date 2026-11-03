/**
 * The banks offered in the Connect your bank flow.
 *
 * TRADEMARKS: bank names, logos, abbreviations and brand colours are all
 * third-party trademarks and trade dress owned by the bank in question. Both the
 * `logo` files and the `label`/`bg`/`fg` tiles below are used here only to build
 * and demonstrate the connect flow. A coloured tile carrying a bank's initials in
 * its own brand colours is still brand usage, so it needs the same sign-off as
 * the logo: written permission from each brand, or compliance with their
 * published brand guidelines. Several Australian banks restrict third-party use
 * outright. Treat everything here as a placeholder pending that clearance.
 */

export type Bank = {
  id: string;
  name: string;
  /** Two to four characters for the tile — a stand-in for the real mark. */
  label: string;
  /** Brand background, as a hex literal. Fixed in both themes: a brand is a brand. */
  bg: string;
  /** Brand foreground for the label. */
  fg: string;
  /**
   * Path under `public/`. Optional, and when the file is there it replaces the
   * tile's label — so dropping in a real SVG is the only step needed to upgrade
   * a bank from initials to its actual mark.
   */
  logo?: string;
};

export const BANKS: Bank[] = [
  { id: "nab", name: "National Australia Bank", label: "NAB", bg: "#1A1A1A", fg: "#E4002B", logo: "/banks/nab.svg" },
  { id: "commbank", name: "Commonwealth Bank", label: "CB", bg: "#FFCC00", fg: "#0A0A0A", logo: "/banks/commbank.svg" },
  { id: "anz", name: "ANZ", label: "ANZ", bg: "#E6F0F7", fg: "#004165", logo: "/banks/anz.svg" },
  { id: "anz-plus", name: "ANZ Plus", label: "A+", bg: "#E6F0F7", fg: "#1E4B8F", logo: "/banks/anz-plus.svg" },
  { id: "westpac", name: "Westpac", label: "W", bg: "#DA1710", fg: "#FFFFFF", logo: "/banks/westpac.svg" },
  { id: "macquarie", name: "Macquarie Bank", label: "M", bg: "#1A1A1A", fg: "#FFFFFF", logo: "/banks/macquarie.svg" },
  { id: "amp", name: "AMP", label: "AMP", bg: "#0091DA", fg: "#FFFFFF", logo: "/banks/amp.svg" },
  { id: "bank-of-melbourne", name: "Bank of Melbourne", label: "BOM", bg: "#002B5C", fg: "#FFFFFF", logo: "/banks/bank-of-melbourne.svg" },
  { id: "ing", name: "ING", label: "ING", bg: "#FF6200", fg: "#FFFFFF", logo: "/banks/ing.svg" },

  /* No asset yet — these show their brand tile until one lands. */
  { id: "bendigo", name: "Bendigo Bank", label: "BEN", bg: "#7C2529", fg: "#FFFFFF" },
  { id: "boq", name: "Bank of Queensland", label: "BOQ", bg: "#00539F", fg: "#FFFFFF" },
  { id: "up", name: "Up", label: "UP", bg: "#2B2D42", fg: "#FFC800" },
  { id: "suncorp", name: "Suncorp", label: "SUN", bg: "#FCB040", fg: "#0A0A0A" },
  { id: "st-george", name: "St.George", label: "STG", bg: "#00A160", fg: "#FFFFFF" },
  { id: "banksa", name: "BankSA", label: "BSA", bg: "#EE3124", fg: "#FFFFFF" },
  { id: "bankwest", name: "Bankwest", label: "BWA", bg: "#000000", fg: "#FDB913" },
  { id: "hsbc", name: "HSBC", label: "HSBC", bg: "#DB0011", fg: "#FFFFFF" },
  { id: "great-southern", name: "Great Southern Bank", label: "GSB", bg: "#00263A", fg: "#FFFFFF" },
  { id: "heritage", name: "Heritage Bank", label: "HER", bg: "#00843D", fg: "#FFFFFF" },
  { id: "beyond", name: "Beyond Bank", label: "BEY", bg: "#004B87", fg: "#FFFFFF" },
];

/** The bank a stored id refers to, or undefined once it no longer names one. */
export function bankById(id: string, banks: Bank[] = BANKS): Bank | undefined {
  return banks.find((bank) => bank.id === id);
}

export function searchBanks(query: string, banks: Bank[] = BANKS): Bank[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return banks;
  return banks.filter(
    (bank) =>
      bank.name.toLowerCase().includes(needle) ||
      // So "NAB" finds National Australia Bank and "CB" finds Commonwealth.
      bank.label.toLowerCase().includes(needle),
  );
}
