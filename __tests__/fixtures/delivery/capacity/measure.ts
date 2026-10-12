import type { RedisClient } from "bun";
import { createDragonflyWsTickets } from "../../../../apps/be-insta/src/domains/users/auth/adapters/dragonfly/ws-ticket";
import type {
  SessionId,
  UserId,
} from "../../../../apps/be-insta/src/domains/users/domain/types";
export const memory = async (client: RedisClient) => {
  const info = String(await client.send("INFO", ["memory"]));
  const clients = String(await client.send("CLIENT", ["LIST"]));
  return {
    usedBytes: Number(info.match(/(?:^|\n)used_memory:(\d+)/)?.[1]),
    rssBytes: Number(info.match(/(?:^|\n)used_memory_rss:(\d+)/)?.[1]),
    connections: clients.trim().split("\n").length,
    blocked: clients.split("\n").filter((line) => / flags=[a-z]*b/.test(line))
      .length,
  };
};
export const authProbe = async (client: RedisClient) => {
  const tickets = createDragonflyWsTickets({ client });
  const now = Date.now();
  const ticket = crypto.randomUUID();
  const actor = {
    userId: "synthetic" as UserId,
    backendSessionId: "synthetic-session" as SessionId,
    username: "synthetic",
    accessExpiresAt: now + 60000,
  };
  try {
    await tickets.issue({ ticket, actor, expiresAt: now + 30000 });
    const consumed = await tickets.consume({ ticket, now });
    return consumed?.userId === "synthetic" &&
      (await tickets.consume({ ticket, now })) === null
      ? "pass"
      : "invalid";
  } catch (error) {
    return error instanceof Error ? error.message : "auth failed";
  }
};
export const isOom = (error: unknown): boolean =>
  error instanceof Error &&
  /OOM|memory/i.test(String(error) + String(error.cause));
