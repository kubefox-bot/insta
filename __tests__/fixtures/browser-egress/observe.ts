import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import {
  connectDragonfly,
  readGeneration,
} from "../../../apps/be-insta/src/lib/dragonfly/index";
import { readTestApiConfig } from "../environment";
import type { BudgetObservation } from "./types";

export const readSourceBudget = async ({
  address,
  config,
  generation,
  read,
}: BudgetObservation) => {
  const source = createHash("sha256")
    .update(z.ipv4().parse(address))
    .digest("hex");
  const digest = createHmac("sha256", Buffer.from(config.authLimitsKey, "hex"))
    .update(source)
    .digest("hex");
  const value = await read(`auth:${generation}:users:limit:loginIp:${digest}`);
  return value === null
    ? 0
    : z.coerce.number().int().nonnegative().parse(value);
};
if (import.meta.main) {
  const config = readTestApiConfig();
  const broker = await connectDragonfly({ config: config.dragonfly });
  try {
    const generation = await readGeneration(broker);
    const count = await readSourceBudget({
      address: z.string().parse(process.argv[2]),
      config,
      generation,
      read: broker.get.bind(broker),
    });
    process.stdout.write(JSON.stringify({ count }));
  } finally {
    broker.close();
  }
}
