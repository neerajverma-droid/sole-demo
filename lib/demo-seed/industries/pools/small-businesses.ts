import type { PoolClient } from "../types";

/** Exactly 16 clients: B2B agencies, clinics, trades, shops and startups. */
const pool: PoolClient[] = [
  { name: "Brightside Marketing Agency", contact: "Natalie Cho", kind: "commercial" },
  { name: "Ironwood Plumbing & Gas", contact: "Craig Dunn", kind: "commercial" },
  { name: "Lumen Physiotherapy Clinic", contact: "Dr Aisha Rahman", kind: "commercial" },
  { name: "Copperleaf Cafe", contact: "Ben Katsaros", kind: "commercial" },
  { name: "Northwind Software Startup", contact: "Tariq Hassan", kind: "commercial" },
  { name: "Fernhill Veterinary Clinic", contact: "Dr Grace Whitaker", kind: "commercial" },
  { name: "Summit Accounting Partners", contact: "Michael Ng", kind: "commercial" },
  { name: "Quarry Lane Bakery", contact: "Elena Petrova", kind: "commercial" },
  { name: "Redline Auto Detailing", contact: "Josh Hemi", kind: "commercial" },
  { name: "Willow & Stone Florist", contact: "Charlotte Dubois", kind: "commercial" },
  { name: "Kestrel Building Co", contact: "Andrew McKay", kind: "commercial" },
  { name: "Bluegum Hair Studio", contact: "Zara Ahmed", kind: "commercial" },
  { name: "Tidewater Hospitality Group", contact: "Nikos Pappas", kind: "strata" },
  { name: "Maple Street Medical Centre", contact: "Dr Leila Farouk", kind: "strata" },
  { name: "Harvest Co-working Space", contact: "Oliver Grant", kind: "strata" },
  { name: "Pinecrest Landscaping", contact: "Sione Tuilagi", kind: "commercial" },
];

export default pool;
