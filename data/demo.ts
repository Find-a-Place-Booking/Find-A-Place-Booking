// Legacy path retained for one migration checkpoint so extracting this milestone
// over the baseline cannot leave the old presentation inventory behind.
// Production code imports from data/catalog.ts. Remove this shim after the
// Milestone 2 checkpoint is accepted.
export { destinations, properties } from "./catalog";
export type { Destination, Property } from "./catalog";
