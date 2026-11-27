import type { PoolClient } from "../types";

/** Exactly 16 clients: dispatchers, wholesalers, courier platforms, small retailers, event companies. */
const pool: PoolClient[] = [
  { name: "Metrolink Dispatch", contact: "Shane Pritchard", kind: "commercial" },
  { name: "Parcelhub Courier Platform", contact: "Nadia Haddad", kind: "commercial" },
  { name: "Greenfield Wholesale Foods", contact: "Vincent Lau", kind: "commercial" },
  { name: "Bayline Hardware", contact: "Darren Koa", kind: "commercial" },
  { name: "Firefly Event Productions", contact: "Tahlia Ward", kind: "commercial" },
  { name: "Redgum Furniture Warehouse", contact: "Paul Matheson", kind: "commercial" },
  { name: "Pacific Pantry Imports", contact: "Losa Fonua", kind: "commercial" },
  { name: "Quickstep Shoe Store", contact: "Meg Sutherland", kind: "commercial" },
  { name: "Northgate Industrial Estate Owners", contact: "Ian Bradshaw", kind: "strata" },
  { name: "Harbourside Markets Association", contact: "Rosa Ferreira", kind: "strata" },
  { name: "Allied Packaging Brokers", contact: "Terry Nguyen", kind: "commercial" },
  { name: "Lighthouse Medical Supplies", contact: "Dr Ellen Park", kind: "commercial" },
  { name: "Ironbridge Building Supplies", contact: "Callum Reid", kind: "commercial" },
  { name: "Stage & Sound Hire", contact: "Josie Hamilton", kind: "commercial" },
  { name: "Kenji Online Bookshop", contact: "Kenji Watanabe", kind: "residential" },
  { name: "Sunrise Bulk Grocers", contact: "Amrita Joshi", kind: "commercial" },
];

export default pool;
