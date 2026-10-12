import type { RedisClient } from "bun";
import { z } from "zod";
import {
  evaluateFenced,
  readGeneration,
} from "../../../../lib/dragonfly/index";
import { changesPerWindow, rateWindowMs } from "../../domain/conts";
import type { Preferences } from "../../ports/preferences";
import { readLua, saveLua } from "./conts";

const storedSchema = z.strictObject({
  contextId: z.string(),
  choice: z.enum(["necessary", "all"]),
  policyVersion: z.number().int().positive(),
  revision: z.number().int().positive(),
  createdAt: z.number(),
  expiresAt: z.number(),
  generation: z.string(),
});
/**
 * Связывает хранение согласия с заимствованным Redis-клиентом и fencing поколения;
 * соединение здесь не закрывается.
 */
export const createDragonflyPreferences = (
  client: RedisClient,
): Preferences => ({
  /** Читает актуальное поколение Dragonfly для отсечения ссылок на потерянные контексты. */
  generation: () => readGeneration(client),
  /**
   * Читает запись через fencing и проверяет сохранённый JSON. Отсутствие возвращает
   * отдельно от ошибок протокола и валидации.
   */
  find: async ({ contextId, generation }) => {
    const value = await evaluateFenced({
      client,
      generation,
      script: readLua,
      keys: [`privacy:preference:${contextId}`],
    });
    if (value === null) return undefined;
    if (typeof value !== "string") throw new Error("Invalid privacy record");
    return storedSchema.parse(JSON.parse(value));
  },
  /**
   * Атомарно проверяет ревизию и квоту источника, сохраняя выбор с оставшимся TTL;
   * возвращает saved, conflict или rateLimited.
   */
  save: async ({ preference, expectedRevision, source, now }) => {
    const value = await evaluateFenced({
      client,
      generation: preference.generation,
      script: saveLua,
      keys: [
        `privacy:preference:${preference.contextId}`,
        `privacy:rate:${source}`,
      ],
      arguments: [
        JSON.stringify(preference),
        expectedRevision === undefined ? "" : String(expectedRevision),
        String(preference.expiresAt - now),
        String(rateWindowMs),
        String(changesPerWindow),
      ],
    });
    if (value !== "saved" && value !== "conflict" && value !== "rateLimited")
      throw new Error("Invalid privacy save outcome");
    return value;
  },
});
