import type { PoolClient } from "../types";

/**
 * Exactly 16 clients. Mix of kinds: ~6 commercial, ~3 strata/organisation
 * (billed on 30-day terms), ~7 residential (billed on 7-day terms).
 * Names must be fictional and region-neutral (no suburb or state in the name)
 * so the same pool works for Australia and New Zealand.
 */
const pool: PoolClient[] = [
  { name: "Harbour View Café", contact: "Mia Chen", kind: "commercial" },
  { name: "Palm Grove Body Corporate", contact: "Daniel Brooks", kind: "strata" },
  { name: "Northside Dental", contact: "Dr Priya Nair", kind: "commercial" },
  { name: "Bayside Fitness", contact: "Jordan Lee", kind: "commercial" },
  { name: "Seabreeze Holiday Units", contact: "Karen Walsh", kind: "strata" },
  { name: "Riverside Bakehouse", contact: "Tom Russo", kind: "commercial" },
  { name: "Miller Family", contact: "Rachel Miller", kind: "residential" },
  { name: "Nguyen Residence", contact: "Linh Nguyen", kind: "residential" },
  { name: "Patel Residence", contact: "Arjun Patel", kind: "residential" },
  { name: "O'Brien Residence", contact: "Sean O'Brien", kind: "residential" },
  { name: "Robinson Residence", contact: "Emma Robinson", kind: "residential" },
  { name: "Kowalski Residence", contact: "Anna Kowalski", kind: "residential" },
  { name: "Greenway Property Management", contact: "Liam Foster", kind: "strata" },
  { name: "Surfside Physio", contact: "Hannah Clarke", kind: "commercial" },
  { name: "Little Learners Childcare", contact: "Sophie Martin", kind: "commercial" },
  { name: "Wilson Residence", contact: "James Wilson", kind: "residential" },
];

export default pool;
