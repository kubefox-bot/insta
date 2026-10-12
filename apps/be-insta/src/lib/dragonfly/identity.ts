import type { DragonflyCommands } from "@insta/fe-core/dragonfly/server";
import { processIdentityLua } from "./conts";
/** Читает физическую identity без bootstrap и без владения клиентом. */
export const readBrokerIdentity = async (
  client: DragonflyCommands,
): Promise<string> => {
  const value = await client.send("EVAL", [
    processIdentityLua + "return identity",
    "0",
  ]);
  if (typeof value !== "string") throw new Error("Broker identity unavailable");
  return value;
};
