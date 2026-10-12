import type { Db } from "mongodb";
import type { DeliveryJournal } from "../../../../ports/delivery/interfaces";
export type MaterializeInput = Parameters<DeliveryJournal["materialize"]>[0] &
  Readonly<{ db: Db }>;

export type RecoveryTarget = import("zod").infer<
  typeof import("../schema").recoveryTargetSchema
>;
