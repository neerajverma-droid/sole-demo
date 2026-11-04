/**
 * Demo business story: Coastal Spark Electrical (Gold Coast, QLD).
 * Ported from backend sole-ocr/src/services/demo/seed/story.js
 */

export const MAIL = (local: string) => `${local}@example.com`;

export const business = {
  id: 1,
  name: "Coastal Spark Electrical",
  owner: { first_name: "Sam", last_name: "Taylor" },
  email: MAIL("accounts.coastalspark"),
  phone: "0491 570 006",
  abn: "51 824 753 556",
  address: {
    line1: "14 Ferry Road",
    city: "Southport",
    state: "QLD",
    postcode: "4215",
    country: "Australia",
  },
  website: "https://coastalspark.example.com",
  industry: "Electrical services",
  industry_id: 1,
  accounting_type: "cash",
  tax_registered: 1,
  bank_name: "Coastal Community Bank",
  bsb: "484-799",
  account_number: "10492831",
  account_holder: "Coastal Spark Electrical",
  currency: "AUD",
  currency_symbol: "$",
  timezone: "Australia/Brisbane",
};

export type ClientKind = "commercial" | "strata" | "residential";

export interface DemoClient {
  id: string;
  name: string;
  contact: string;
  kind: ClientKind;
  email: string;
  phone?: string;
  city: string;
  country: string;
  contactId: string;
}

export const rawClients: Omit<DemoClient, "id" | "contactId">[] = [
  { name: "Harbour View Café", contact: "Mia Chen", kind: "commercial", city: "Southport", country: "Australia", email: MAIL("mia.chen") },
  { name: "Palm Grove Body Corporate", contact: "Daniel Brooks", kind: "strata", city: "Surfers Paradise", country: "Australia", email: MAIL("daniel.brooks") },
  { name: "Northside Dental", contact: "Dr Priya Nair", kind: "commercial", city: "Southport", country: "Australia", email: MAIL("priya.nair") },
  { name: "Bayside Fitness", contact: "Jordan Lee", kind: "commercial", city: "Broadbeach", country: "Australia", email: MAIL("jordan.lee") },
  { name: "Seabreeze Holiday Units", contact: "Karen Walsh", kind: "strata", city: "Main Beach", country: "Australia", email: MAIL("karen.walsh") },
  { name: "Burleigh Bakehouse", contact: "Tom Russo", kind: "commercial", city: "Burleigh Heads", country: "Australia", email: MAIL("tom.russo") },
  { name: "Miller Family", contact: "Rachel Miller", kind: "residential", city: "Robina", country: "Australia", email: MAIL("rachel.miller") },
  { name: "Nguyen Residence", contact: "Linh Nguyen", kind: "residential", city: "Southport", country: "Australia", email: MAIL("linh.nguyen") },
  { name: "Patel Residence", contact: "Arjun Patel", kind: "residential", city: "Varsity Lakes", country: "Australia", email: MAIL("arjun.patel") },
  { name: "O'Brien Residence", contact: "Sean O'Brien", kind: "residential", city: "Helensvale", country: "Australia", email: MAIL("sean.obrien") },
  { name: "Robinson Residence", contact: "Emma Robinson", kind: "residential", city: "Currumbin", country: "Australia", email: MAIL("emma.robinson") },
  { name: "Kowalski Residence", contact: "Anna Kowalski", kind: "residential", city: "Coomera", country: "Australia", email: MAIL("anna.kowalski") },
  { name: "Greenway Property Management", contact: "Liam Foster", kind: "strata", city: "Bundall", country: "Australia", email: MAIL("liam.foster") },
  { name: "Surfside Physio", contact: "Hannah Clarke", kind: "commercial", city: "Broadbeach", country: "Australia", email: MAIL("hannah.clarke") },
  { name: "Tallebudgera Childcare", contact: "Sophie Martin", kind: "commercial", city: "Tallebudgera", country: "Australia", email: MAIL("sophie.martin") },
  { name: "Wilson Residence", contact: "James Wilson", kind: "residential", city: "Southport", country: "Australia", email: MAIL("james.wilson") },
];

export const clients: DemoClient[] = rawClients.map((client, index) => ({
  ...client,
  id: String(100 + index),
  contactId: String(200 + index),
}));

export interface DemoSupplier {
  id: string;
  name: string;
  contact: string;
  category: string[];
  subcategoryId: number;
  typical: [number, number];
  email: string;
  contactId: string;
}

export const rawSuppliers = [
  { name: "Middy's Electrical", contact: "Trade Counter", category: ["cost incurred on a job", "materials"], subcategoryId: 141, typical: [180, 1400] as [number, number] },
  { name: "Bunnings Warehouse", contact: "Trade Desk", category: ["consumables", "tools"], subcategoryId: 142, typical: [25, 380] as [number, number] },
  { name: "Ampol Southport", contact: "Accounts", category: ["motor vehicle expenses", "fuel"], subcategoryId: 143, typical: [70, 140] as [number, number] },
  { name: "Telstra", contact: "Billing", category: ["telephone", "internet"], subcategoryId: 144, typical: [89, 89] as [number, number] },
  { name: "Tradie Insurance Co", contact: "Policy Team", category: ["insurance"], subcategoryId: 145, typical: [245, 245] as [number, number] },
  { name: "Coastline Hire", contact: "Hire Desk", category: ["equipment hire"], subcategoryId: 146, typical: [120, 460] as [number, number] },
  { name: "Officeworks", contact: "Store", category: ["office expenses"], subcategoryId: 147, typical: [15, 120] as [number, number] },
  { name: "Gold Coast Workwear", contact: "Sales", category: ["uniform", "clothing"], subcategoryId: 148, typical: [60, 220] as [number, number] },
];

export const suppliers: DemoSupplier[] = rawSuppliers.map((supplier, index) => ({
  ...supplier,
  id: String(500 + index),
  contactId: String(600 + index),
  email: MAIL(`accounts.${supplier.name.toLowerCase().replace(/[^a-z]+/g, "")}`),
}));

export interface DemoService {
  id: string;
  name: string;
  price: number;
  unit: string;
  kinds: ClientKind[];
}

export const rawServices: Omit<DemoService, "id">[] = [
  { name: "Call-out fee", price: 95, unit: "items", kinds: ["residential", "commercial", "strata"] },
  { name: "Electrician labour (per hour)", price: 110, unit: "hours", kinds: ["residential", "commercial", "strata"] },
  { name: "Apprentice labour (per hour)", price: 65, unit: "hours", kinds: ["commercial", "strata"] },
  { name: "Power point supply & install", price: 145, unit: "items", kinds: ["residential", "commercial"] },
  { name: "LED downlight supply & install", price: 68, unit: "items", kinds: ["residential", "commercial"] },
  { name: "Smoke alarm (240V) supply & install", price: 185, unit: "items", kinds: ["residential", "strata"] },
  { name: "Ceiling fan installation", price: 165, unit: "items", kinds: ["residential"] },
  { name: "Switchboard upgrade", price: 1850, unit: "items", kinds: ["residential", "commercial"] },
  { name: "EV charger installation", price: 1450, unit: "items", kinds: ["residential", "commercial"] },
  { name: "Test and tag (per item)", price: 6.5, unit: "items", kinds: ["commercial", "strata"] },
  { name: "Emergency lighting inspection", price: 320, unit: "items", kinds: ["commercial", "strata"] },
  { name: "Safety switch (RCD) install", price: 210, unit: "items", kinds: ["residential", "strata"] },
];

export const services: DemoService[] = rawServices.map((service, index) => ({
  ...service,
  id: String(300 + index),
}));

export interface DemoInventoryProduct {
  id: string;
  name: string;
  sku: string;
  cost_price: number;
  selling_price: number;
  unit: "items";
  inventory_count: number;
  low_stock_threshold: number;
  tracked: boolean;
  purchase_description: string;
  sale_description: string;
}

export const rawInventoryProducts: DemoInventoryProduct[] = [
  {
    id: "350",
    name: "Clipsal Smoke Alarm Photoelectric 240V",
    sku: "ELEC-SA-240",
    cost_price: 45,
    selling_price: 95,
    unit: "items",
    inventory_count: 24,
    low_stock_threshold: 6,
    tracked: true,
    purchase_description: "Clipsal 755PSMA4 photoelectric smoke alarm with 9V battery backup",
    sale_description: "Clipsal 240V photoelectric smoke alarm supply",
  },
  {
    id: "351",
    name: "Clipsal Iconic Double GPO Power Point 10A",
    sku: "ELEC-GPO-2X",
    cost_price: 11.5,
    selling_price: 26,
    unit: "items",
    inventory_count: 48,
    low_stock_threshold: 12,
    tracked: true,
    purchase_description: "Clipsal Iconic 3025USBC double power point vivid white",
    sale_description: "Clipsal Iconic double power point 10A 250V",
  },
  {
    id: "352",
    name: "Tri-Colour Dimmable LED Downlight 10W",
    sku: "LIGHT-DL-10W",
    cost_price: 14,
    selling_price: 36,
    unit: "items",
    inventory_count: 65,
    low_stock_threshold: 15,
    tracked: true,
    purchase_description: "SAL Wave 10W tri-colour LED downlight IP44",
    sale_description: "10W tri-colour dimmable LED downlight (warm/neutral/cool)",
  },
  {
    id: "353",
    name: "Schneider RCBO Safety Switch 16A 30mA",
    sku: "SW-RCBO-16A",
    cost_price: 22,
    selling_price: 52,
    unit: "items",
    inventory_count: 32,
    low_stock_threshold: 8,
    tracked: true,
    purchase_description: "Schneider Resi9 1P+N 16A 30mA Type A RCBO",
    sale_description: "Schneider 16A safety switch RCBO circuit protection",
  },
  {
    id: "354",
    name: "2.5mm Twin & Earth Cable (100m Drum)",
    sku: "CAB-TE-25",
    cost_price: 95,
    selling_price: 165,
    unit: "items",
    inventory_count: 9,
    low_stock_threshold: 3,
    tracked: true,
    purchase_description: "Olex 2.5mm TPS twin & earth electrical building wire 100m",
    sale_description: "2.5mm twin & earth TPS cable 100m",
  },
  {
    id: "355",
    name: "Corrugated Medium Duty Conduit 20mm (50m)",
    sku: "CON-20MM-50M",
    cost_price: 28,
    selling_price: 58,
    unit: "items",
    inventory_count: 14,
    low_stock_threshold: 4,
    tracked: true,
    purchase_description: "Clipsal 20mm grey corrugated flexible electrical conduit 50m",
    sale_description: "20mm corrugated flexible conduit 50m coil",
  },
  {
    id: "356",
    name: "HPM 250mm Ceiling Exhaust Fan Round",
    sku: "VENT-EF-250",
    cost_price: 32,
    selling_price: 75,
    unit: "items",
    inventory_count: 3,
    low_stock_threshold: 5,
    tracked: true,
    purchase_description: "HPM 250mm round ceiling exhaust fan draft stopper",
    sale_description: "HPM 250mm round ceiling exhaust fan",
  },
  {
    id: "357",
    name: "Tesla Wall Connector Gen 3 32A",
    sku: "EV-TESLA-GEN3",
    cost_price: 680,
    selling_price: 890,
    unit: "items",
    inventory_count: 5,
    low_stock_threshold: 2,
    tracked: true,
    purchase_description: "Tesla Gen 3 Wall Connector 7.3m cable 32A single/three phase",
    sale_description: "Tesla Wall Connector Gen 3 hardwired EV charging unit",
  },
];

export interface DemoProject {
  id: string;
  name: string;
  client: string;
  clientId: string;
  contactId: string;
  code: string;
  budget: number;
  months: [number, number];
  status: "inprogress" | "completed" | "draft";
  jobs: { id: string; name: string; code: string }[];
}

export const projects: DemoProject[] = [
  {
    id: "1",
    name: "Harbour View Café fit-out",
    client: "Harbour View Café",
    clientId: "100",
    contactId: "200",
    code: "PRO-1",
    budget: 18500,
    months: [-4, 1],
    status: "inprogress",
    jobs: [
      { id: "101", name: "Rough-in", code: "PRO-1-J1" },
      { id: "102", name: "Fit-off", code: "PRO-1-J2" },
      { id: "103", name: "Testing & compliance", code: "PRO-1-J3" },
    ],
  },
  {
    id: "2",
    name: "Palm Grove smoke alarm compliance",
    client: "Palm Grove Body Corporate",
    clientId: "101",
    contactId: "201",
    code: "PRO-2",
    budget: 9200,
    months: [-2, 1],
    status: "inprogress",
    jobs: [
      { id: "201", name: "Block A", code: "PRO-2-J1" },
      { id: "202", name: "Block B", code: "PRO-2-J2" },
    ],
  },
  {
    id: "3",
    name: "Nguyen kitchen renovation",
    client: "Nguyen Residence",
    clientId: "107",
    contactId: "207",
    code: "PRO-3",
    budget: 6400,
    months: [-5, -3],
    status: "completed",
    jobs: [
      { id: "301", name: "Rough-in", code: "PRO-3-J1" },
      { id: "302", name: "Fit-off", code: "PRO-3-J2" },
    ],
  },
  {
    id: "4",
    name: "Bayside Fitness EV chargers",
    client: "Bayside Fitness",
    clientId: "103",
    contactId: "203",
    code: "PRO-4",
    budget: 7800,
    months: [0, 2],
    status: "draft",
    jobs: [
      { id: "401", name: "Site survey", code: "PRO-4-J1" },
      { id: "402", name: "Install", code: "PRO-4-J2" },
    ],
  },
];

export const vehicle = {
  nickname: "Work ute",
  make: "Toyota",
  model: "HiLux SR",
  year: "2022",
  registration_number: "123-ABC",
  fuel_type: "Diesel",
  engine_capacity: "2.8L",
  logbook_start_odometer: "38200",
};

export const assets = [
  {
    id: "1",
    name: "Toyota HiLux SR (work ute)",
    category: "Vehicle",
    brand: "Toyota",
    type: "Ute",
    price: 54990,
    monthsAgo: 14,
    life: 8,
    method: "diminishing_value",
    supplier: null,
    serial: "MR0FA3CD200123456",
  },
  {
    id: "2",
    name: "Makita 18V combo kit",
    category: "Tools",
    brand: "Makita",
    type: "Power tool kit",
    price: 1299,
    monthsAgo: 9,
    life: 5,
    method: "straight_line",
    supplier: "Bunnings Warehouse",
    serial: "MKT-DLX6087",
  },
  {
    id: "3",
    name: "Fluke multifunction installation tester",
    category: "Equipment",
    brand: "Fluke",
    type: "Test equipment",
    price: 3480,
    monthsAgo: 6,
    life: 7,
    method: "straight_line",
    supplier: "Middy's Electrical",
    serial: "FLK-1664FC-8821",
  },
  {
    id: "4",
    name: "MacBook Air 13-inch",
    category: "Technology",
    brand: "Apple",
    type: "Laptop",
    price: 1899,
    monthsAgo: 3,
    life: 3,
    method: "straight_line",
    supplier: "Officeworks",
    serial: "C02DEMO1234",
  },
];

export const employees = [
  { id: "1", first_name: "Jake", last_name: "Morrison", role: "Apprentice electrician", hourly: 24.5, hours: 38, email: MAIL("jake.morrison") },
  { id: "2", first_name: "Olivia", last_name: "Grant", role: "Office admin (part-time)", hourly: 34, hours: 15, email: MAIL("olivia.grant") },
];

