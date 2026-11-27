import type { PoolClient } from "../types";

/** Exactly 16 clients: growers, co-ops, packhouses, stock agents, rural suppliers, farm-gate buyers. */
const pool: PoolClient[] = [
  { name: "Valley Fresh Packhouse", contact: "Kerry Donnelly", kind: "commercial" },
  { name: "Ridgeback Growers Co-op", contact: "Bill Hastings", kind: "strata" },
  { name: "Stonecreek Stock & Station", contact: "Rob Gilmour", kind: "commercial" },
  { name: "Greenmeadow Orchards", contact: "Tim Alexander", kind: "commercial" },
  { name: "Southern Cross Produce Markets", contact: "Anh Tran", kind: "commercial" },
  { name: "Hilltop Rural Supplies", contact: "Janine Fitzpatrick", kind: "commercial" },
  { name: "Wattlebird Farm Gate Store", contact: "Georgia Harper", kind: "commercial" },
  { name: "Mackenzie Family Farm", contact: "Don Mackenzie", kind: "residential" },
  { name: "Ngata Dairy Partnership", contact: "Rawiri Ngata", kind: "commercial" },
  { name: "Sunnybrook Berry Farm", contact: "Lucia Moretti", kind: "commercial" },
  { name: "Plainsland Wool Brokers", contact: "Graeme Fowler", kind: "commercial" },
  { name: "Cooper & Sons Vineyard", contact: "Annette Cooper", kind: "commercial" },
  { name: "Riverflat Irrigation Group", contact: "Hamish Rowley", kind: "strata" },
  { name: "Thornbury Free Range Eggs", contact: "Carol Thornbury", kind: "residential" },
  { name: "District Farmers Market Association", contact: "Sue Whitmore", kind: "strata" },
  { name: "Bellbird Hill Honey", contact: "Aiden Rutherford", kind: "residential" },
];

export default pool;
