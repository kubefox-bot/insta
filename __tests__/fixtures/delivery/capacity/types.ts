import type { DeliveryPosition } from "@insta/contracts/realtime";
import type { RedisClient } from "bun";
import type { DeliveryStreams } from "../../../../apps/be-insta/src/domains/conversations/ports/delivery/interfaces";
import type {
  DeliveryLease,
  DeliveryStream,
} from "../../../../apps/be-insta/src/domains/conversations/ports/delivery/types";
export type CapacityInput = Readonly<{
  profile: "fanout" | "conversation";
  rate: number;
}>;
export type CapacitySlot = Readonly<{
  stream: DeliveryStream;
  lease: DeliveryLease;
  after: DeliveryPosition;
}>;
export type CapacityEnvironment = Readonly<{
  adapter: DeliveryStreams;
  client: RedisClient;
  authClient: RedisClient;
  slots: readonly CapacitySlot[];
  count: number;
  nowMs: number;
}>;
export type CapacityTotals = {
  inserted: number;
  encodedBytes: number;
  readonly bytesByType: Record<string, number>;
};
