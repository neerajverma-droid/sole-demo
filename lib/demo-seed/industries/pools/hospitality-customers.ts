import type { PoolClient } from "../types";

/** Exactly 16 clients: event organisers, offices, venues, private catering clients, wedding planners. */
const pool: PoolClient[] = [
  { name: "Orchard Events Co", contact: "Danielle Reyes", kind: "commercial" },
  { name: "Vantage Law Partners", contact: "Rohan Mehta", kind: "commercial" },
  { name: "Silverbirch Wedding Planners", contact: "Poppy Lawrence", kind: "commercial" },
  { name: "The Old Mill Venue", contact: "Gareth Evans", kind: "commercial" },
  { name: "Brightwave Tech Offices", contact: "Yuki Tanaka", kind: "commercial" },
  { name: "Heritage Hall Committee", contact: "Margaret Doyle", kind: "strata" },
  { name: "Greenvale Rotary Club", contact: "Hugh Mackenzie", kind: "strata" },
  { name: "Sporting Club Social Committee", contact: "Leanne Patterson", kind: "strata" },
  { name: "Kaitlyn & Ben Rowe", contact: "Kaitlyn Rowe", kind: "residential" },
  { name: "Okonkwo Family Celebration", contact: "Chidi Okonkwo", kind: "residential" },
  { name: "Matthew Dunstan", contact: "Matthew Dunstan", kind: "residential" },
  { name: "Sienna Gallagher", contact: "Sienna Gallagher", kind: "residential" },
  { name: "Crestline Conference Centre", contact: "Barbara Lim", kind: "commercial" },
  { name: "Wattle Grove Retirement Village", contact: "Colin Ferris", kind: "strata" },
  { name: "Atlas Architecture Studio", contact: "Naomi Fischer", kind: "commercial" },
  { name: "Whitfield Private Dining Club", contact: "Alistair Whitfield", kind: "commercial" },
];

export default pool;
