import type { RedisClient } from "bun";
import { z } from "zod";
import {
  evaluateFenced,
  readGeneration,
} from "../../../../../lib/dragonfly/index";
import type { Actor } from "../../domain/types";
import { ticketLifetimeMs, ticketNamespace } from "../../domain/ws/conts";
import type { WsTickets } from "../../ports/ws-tickets";

const storedSchema = z.strictObject({
  actor: z.strictObject({
    userId: z.string(),
    backendSessionId: z.string(),
    username: z.string(),
    accessExpiresAt: z.number(),
  }),
  expiresAt: z.number(),
});
/**
 * Создаёт одноразовые WS tickets в текущем поколении Dragonfly на заимствованном клиенте;
 * закрытие клиента остаётся у composition.
 */
export const createDragonflyWsTickets = ({
  client,
}: Readonly<{ client: RedisClient }>): WsTickets => ({
  /**
   * Сохраняет actor под новым ticket с TTL и NX; коллизия не перезаписывает прежний
   * ticket и вызывает ошибку.
   */
  issue: async ({ ticket, actor, expiresAt }) => {
    const generation = await readGeneration(client);
    const result = await evaluateFenced({
      client,
      generation,
      keys: [`${ticketNamespace}:${ticket}`],
      script: "return redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3], 'NX')",
      arguments: [
        JSON.stringify({ actor, expiresAt }),
        String(ticketLifetimeMs),
      ],
    });
    if (result !== "OK") throw new Error("Ticket collision");
  },
  /**
   * Атомарно удаляет и читает UUID-ticket; истёкший ticket или access возвращает null уже
   * после потребления, ошибки данных и Redis пробрасываются.
   */
  consume: async ({ ticket, now }) => {
    if (!z.uuid().safeParse(ticket).success) return null;
    const generation = await readGeneration(client);
    const result = await evaluateFenced({
      client,
      generation,
      keys: [`${ticketNamespace}:${ticket}`],
      script: "return redis.call('GETDEL', KEYS[2])",
    });
    if (result === null) return null;
    const stored = storedSchema.parse(JSON.parse(z.string().parse(result)));
    if (stored.expiresAt <= now || stored.actor.accessExpiresAt <= now)
      return null;
    // Branded identifiers are validated when authorizing the canonical session.
    return stored.actor as Actor;
  },
});
