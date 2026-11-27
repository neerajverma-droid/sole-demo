import type { PoolClient } from "../types";

/** Exactly 16 clients: shoppers, local businesses, market organisers, online buyers, corporate gifting. */
const pool: PoolClient[] = [
  { name: "Rebecca Lawson", contact: "Rebecca Lawson", kind: "residential" },
  { name: "Tomas Novak", contact: "Tomas Novak", kind: "residential" },
  { name: "Aaliyah Brown", contact: "Aaliyah Brown", kind: "residential" },
  { name: "Henry Cho", contact: "Henry Cho", kind: "residential" },
  { name: "Mereana Walker", contact: "Mereana Walker", kind: "residential" },
  { name: "Sandra Kowalczyk", contact: "Sandra Kowalczyk", kind: "residential" },
  { name: "Greta Lindholm", contact: "Greta Lindholm", kind: "residential" },
  { name: "Riverbend Makers Market", contact: "Cassie Doyle", kind: "strata" },
  { name: "Sunday Fair Stallholders Association", contact: "Frank Moretti", kind: "strata" },
  { name: "Lakeside Boutique Hotel", contact: "Priya Sharma", kind: "commercial" },
  { name: "Bayleaf Day Spa", contact: "Tess Oliver", kind: "commercial" },
  { name: "Coopers Corner Cafe", contact: "Ryan Coopers", kind: "commercial" },
  { name: "Redwood Realty Group", contact: "Sophie Yates", kind: "commercial" },
  { name: "Halcyon Corporate Gifting", contact: "Marcus Webb", kind: "commercial" },
  { name: "Evergreen Wedding Planners", contact: "Imani Joseph", kind: "commercial" },
  { name: "Cartwright & Daughters Online Shop", contact: "Jenna Cartwright", kind: "commercial" },
];

export default pool;
