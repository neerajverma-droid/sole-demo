import type { PoolClient } from "../types";

/**
 * Exactly 16 clients: participants and families (residential), plus plan
 * managers, support coordinators and providers (commercial / strata).
 */
const pool: PoolClient[] = [
  { name: "Ava Henderson", contact: "Sarah Henderson", kind: "residential" },
  { name: "Liam Tupou", contact: "Mele Tupou", kind: "residential" },
  { name: "Noah Castellano", contact: "Maria Castellano", kind: "residential" },
  { name: "Isabella Wright", contact: "David Wright", kind: "residential" },
  { name: "Mohammed Al-Sayed", contact: "Fatima Al-Sayed", kind: "residential" },
  { name: "Chloe Anderson", contact: "Jenny Anderson", kind: "residential" },
  { name: "Ethan Pham", contact: "Thu Pham", kind: "residential" },
  { name: "Grace Kaufana", contact: "Tipene Kaufana", kind: "residential" },
  { name: "Oscar Lindqvist", contact: "Karin Lindqvist", kind: "residential" },
  { name: "Maya Singh", contact: "Harpreet Singh", kind: "residential" },
  { name: "ClearPath Plan Management", contact: "Rebecca Ford", kind: "commercial" },
  { name: "Anchor Support Coordination", contact: "Peter Nwosu", kind: "commercial" },
  { name: "Brightfuture Therapy Group", contact: "Dr Annika Berg", kind: "commercial" },
  { name: "Kindred Community Care", contact: "Louise Matthews", kind: "strata" },
  { name: "Open Door Disability Services", contact: "Tom Hartley", kind: "strata" },
  { name: "Steady Steps Allied Health", contact: "Jasmine Cole", kind: "commercial" },
];

export default pool;
