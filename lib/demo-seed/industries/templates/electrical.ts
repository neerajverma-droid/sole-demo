import type { IndustryTemplate } from "../types";

/**
 * Reference template — copy its shape for every other industry.
 *
 * Prices are ex-tax, in the local currency (AUD/NZD are close enough that one
 * set of numbers serves both). Supplier names are fictional so nothing in the
 * demo implies a real company's accounts; prefer that over real brands.
 */
export const electrical: IndustryTemplate = {
  slug: "electrical",
  short: "Electrical",
  businessNames: { AU: "Coastal Spark Electrical", NZ: "Kiwi Spark Electrical" },
  clientPool: "households-and-businesses",
  services: [
    { name: "Call-out fee", price: 95, unit: "items" },
    { name: "Electrician labour (per hour)", price: 110, unit: "hours" },
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
  ],
  products: [
    { name: "Photoelectric Smoke Alarm 240V", sku: "ELEC-SA-240", cost: 45, price: 95, qty: 24, low: 6 },
    { name: "Double Power Point 10A", sku: "ELEC-GPO-2X", cost: 11.5, price: 26, qty: 48, low: 12 },
    { name: "Tri-Colour Dimmable LED Downlight 10W", sku: "LIGHT-DL-10W", cost: 14, price: 36, qty: 65, low: 15 },
    { name: "RCBO Safety Switch 16A 30mA", sku: "SW-RCBO-16A", cost: 22, price: 52, qty: 32, low: 8 },
    { name: "2.5mm Twin & Earth Cable (100m Drum)", sku: "CAB-TE-25", cost: 95, price: 165, qty: 9, low: 3 },
    { name: "Ceiling Exhaust Fan 250mm", sku: "VENT-EF-250", cost: 32, price: 75, qty: 3, low: 5 },
  ],
  suppliers: [
    {
      name: "Metro Electrical Wholesale",
      contact: "Trade Counter",
      category: ["cost incurred on a job", "materials"],
      typical: [180, 1400],
      items: ["Cable, conduit and fittings", "Switchgear and RCDs", "LED downlights (box of 20)", "Smoke alarms and bases"],
    },
    {
      name: "Coastline Equipment Hire",
      contact: "Hire Desk",
      category: ["equipment hire"],
      typical: [120, 460],
      items: ["Scissor lift hire", "Trencher hire (1 day)"],
    },
    {
      name: "Tradie Workwear Co",
      contact: "Sales",
      category: ["uniform", "clothing"],
      typical: [60, 220],
      items: ["Hi-vis shirts and work boots", "Arc-rated workwear"],
    },
  ],
  assets: [
    { name: "Cordless tool combo kit", category: "Tools", brand: "Makita", type: "Power tool kit", price: 1299, monthsAgo: 9, life: 5 },
    { name: "Multifunction installation tester", category: "Equipment", brand: "Fluke", type: "Test equipment", price: 3480, monthsAgo: 6, life: 7 },
    { name: "Laptop 13-inch", category: "Technology", brand: "Apple", type: "Laptop", price: 1899, monthsAgo: 3, life: 3 },
  ],
  employees: [
    { role: "Apprentice electrician", hourly: 24.5, hours: 38 },
    { role: "Office admin (part-time)", hourly: 34, hours: 15 },
  ],
  vehicle: { nickname: "Work ute", make: "Toyota", model: "HiLux SR", year: "2022", fuel: "Diesel" },
  job: {
    noun: "call-out",
    bookingTitle: "Book an electrician call-out",
    bookingBlurb: "Residential and commercial call-outs, with the first 30 minutes of labour included.",
    projects: [
      "{client} fit-out wiring",
      "{client} smoke alarm compliance",
      "{client} switchboard upgrade",
      "{client} EV charger install",
    ],
    stages: ["Rough-in", "Fit-off", "Testing & compliance", "Handover"],
  },
};
