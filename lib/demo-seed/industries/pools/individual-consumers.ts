import type { PoolClient } from "../types";

/** Exactly 16 clients: mostly individuals, plus a few small businesses and schools. */
const pool: PoolClient[] = [
  { name: "Emma Thompson", contact: "Emma Thompson", kind: "residential" },
  { name: "Raj Malhotra", contact: "Raj Malhotra", kind: "residential" },
  { name: "Olivia Nguyen", contact: "Olivia Nguyen", kind: "residential" },
  { name: "Marcus Johnson", contact: "Marcus Johnson", kind: "residential" },
  { name: "Sofia Rossi", contact: "Sofia Rossi", kind: "residential" },
  { name: "Tane Walker", contact: "Tane Walker", kind: "residential" },
  { name: "Hannah Becker", contact: "Hannah Becker", kind: "residential" },
  { name: "Daniel Okafor", contact: "Daniel Okafor", kind: "residential" },
  { name: "Mei Lin Zhao", contact: "Mei Lin Zhao", kind: "residential" },
  { name: "Callum Fraser", contact: "Callum Fraser", kind: "residential" },
  { name: "Priya Venkatesh", contact: "Priya Venkatesh", kind: "residential" },
  { name: "Jack Sullivan", contact: "Jack Sullivan", kind: "residential" },
  { name: "Brightpath Primary School", contact: "Helen Marsh", kind: "strata" },
  { name: "Sunrise Community Centre", contact: "Aroha Parata", kind: "strata" },
  { name: "Oakhill Dental Studio", contact: "Dr Samuel Reid", kind: "commercial" },
  { name: "Greenfield Pilates Studio", contact: "Isla Campbell", kind: "commercial" },
];

export default pool;
