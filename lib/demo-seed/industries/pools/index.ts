import type { ClientPoolKey, PoolClient } from "../types";
import careParticipants from "./care-participants";
import creativeClients from "./creative-clients";
import farmCustomers from "./farm-customers";
import freightCustomers from "./freight-customers";
import hospitalityCustomers from "./hospitality-customers";
import householdsAndBusinesses from "./households-and-businesses";
import individualConsumers from "./individual-consumers";
import propertyOwners from "./property-owners";
import retailCustomers from "./retail-customers";
import smallBusinesses from "./small-businesses";

export const POOLS: Record<ClientPoolKey, PoolClient[]> = {
  "households-and-businesses": householdsAndBusinesses,
  "individual-consumers": individualConsumers,
  "small-businesses": smallBusinesses,
  "care-participants": careParticipants,
  "property-owners": propertyOwners,
  "creative-clients": creativeClients,
  "retail-customers": retailCustomers,
  "hospitality-customers": hospitalityCustomers,
  "farm-customers": farmCustomers,
  "freight-customers": freightCustomers,
};
