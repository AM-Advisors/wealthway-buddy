/** Explicit origin, independent of vehicle type, investors or imported files. */
export type FundOrigin = "new" | "migration";
export const fundOriginLabel = (origin: unknown) => origin === "new" ? "New fund" : origin === "migration" ? "Migration" : "Not classified";
export const migrationApplies = (origin: unknown) => origin === "migration";
