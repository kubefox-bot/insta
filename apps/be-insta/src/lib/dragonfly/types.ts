import type { DragonflyCommands } from "@insta/fe-core/dragonfly/server";
import type { RedisClient } from "bun";
export type DeliveryConnection = Readonly<{
  client: DragonflyCommands;
  openReader: () => Promise<RedisClient>;
  close: () => Promise<void>;
}>;
