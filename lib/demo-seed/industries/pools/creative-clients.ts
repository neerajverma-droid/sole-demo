import type { PoolClient } from "../types";

/** Exactly 16 clients: brands, agencies, couples and individuals, publishers, galleries. */
const pool: PoolClient[] = [
  { name: "Wildflower Skincare", contact: "Imogen Hart", kind: "commercial" },
  { name: "Foxtrot Creative Agency", contact: "Dylan Pereira", kind: "commercial" },
  { name: "Olive & Ash Wedding", contact: "Lucy Armstrong", kind: "residential" },
  { name: "Kai & Jordan Mitchell", contact: "Jordan Mitchell", kind: "residential" },
  { name: "Paperbark Press", contact: "Ruth Eastwood", kind: "commercial" },
  { name: "Second Light Gallery", contact: "Anton Vogel", kind: "strata" },
  { name: "Tidepool Coffee Roasters", contact: "Maya Fitzgerald", kind: "commercial" },
  { name: "Aroha & Sam Collins", contact: "Aroha Collins", kind: "residential" },
  { name: "Lantern Records", contact: "Marcus Bell", kind: "commercial" },
  { name: "Atlas Outdoor Gear", contact: "Chen Wei", kind: "commercial" },
  { name: "Harlow Theatre Company", contact: "Beatrice Okoye", kind: "strata" },
  { name: "Emerson Family Portraits", contact: "Claire Emerson", kind: "residential" },
  { name: "Northern Lights Podcast", contact: "Joel Tanaka", kind: "commercial" },
  { name: "Meridian Arts Council", contact: "Patricia Lowe", kind: "strata" },
  { name: "Sage Interiors", contact: "Holly Brandt", kind: "commercial" },
  { name: "Dr Anil Kapoor", contact: "Anil Kapoor", kind: "residential" },
];

export default pool;
