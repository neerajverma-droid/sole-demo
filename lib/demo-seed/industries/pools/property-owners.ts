import type { PoolClient } from "../types";

/** Exactly 16 clients: landlords, investors, owners corporations and developers. */
const pool: PoolClient[] = [
  { name: "Harrison Family Trust", contact: "Peter Harrison", kind: "residential" },
  { name: "Anita Deshmukh", contact: "Anita Deshmukh", kind: "residential" },
  { name: "Callaghan Investments", contact: "Ruth Callaghan", kind: "commercial" },
  { name: "Wen & Li Property Holdings", contact: "Wen Li", kind: "commercial" },
  { name: "Marlow Gardens Owners Corporation", contact: "Greg Salter", kind: "strata" },
  { name: "Cedar Court Body Corporate", contact: "Joanne Whelan", kind: "strata" },
  { name: "Brennan Rental Portfolio", contact: "Sean Brennan", kind: "commercial" },
  { name: "Tahu & Moana Rentals", contact: "Moana Tahu", kind: "residential" },
  { name: "Ridgeview Developments", contact: "Alex Konstantin", kind: "commercial" },
  { name: "Sandpiper Apartments Owners Group", contact: "Fiona Beckett", kind: "strata" },
  { name: "Gill Property Partners", contact: "Gurpreet Gill", kind: "commercial" },
  { name: "Dr Rosa Almeida", contact: "Rosa Almeida", kind: "residential" },
  { name: "Foxglove Terrace Owners Corporation", contact: "Martin Doyle", kind: "strata" },
  { name: "Kowhai Estates Limited", contact: "Hemi Rangi", kind: "commercial" },
  { name: "Nolan Super Fund Property", contact: "Kevin Nolan", kind: "residential" },
  { name: "Silverline Build & Hold", contact: "Tamara Osei", kind: "commercial" },
];

export default pool;
