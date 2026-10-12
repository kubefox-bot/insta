import type { DragonflyCommands } from "@insta/fe-core/dragonfly/server";
import { evaluateFenced } from "@insta/fe-core/dragonfly/server";
import { z } from "zod";
import { intentTypes } from "../../domain/conts";
import { resumeTargetSchema } from "../../domain/target";
import type { Intent } from "../../domain/types";
import type { Intents } from "../../ports/intents";
import { brokerNamespace, compareLua, createLua } from "./conts";

const intentSchema = z.strictObject({
  type: z.enum(intentTypes),
  recipientId: z.string().optional(),
  operationId: z.uuid(),
  intentId: z.uuid(),
  context: z.string(),
  expectedUserId: z.string().optional(),
  createdAt: z.number(),
  expiresAt: z.number(),
  state: z.enum(["pending", "consumed", "cancelled"]),
  actorId: z.string().optional(),
  actorGeneration: z.string().optional(),
  target: resumeTargetSchema.optional(),
});
/**
 * Создаёт хранилище intent поверх заимствованного Dragonfly-клиента с broker-generation fence,
 * проверкой схемы и TTL; клиент остаётся у composition.
 */
export const createDragonflyIntents = ({
  client,
  generation,
  namespace = "continuation",
}: Readonly<{
  client: DragonflyCommands;
  generation: string;
  namespace?: string;
}>): Intents => {
  if (!/^[A-Za-z0-9_-]+$/.test(namespace))
    throw new Error("Invalid continuation namespace");
  /**
   * Проверяет UUID intent перед построением ключа в валидированном namespace.
   */
  const key = (id: string) => {
    if (!z.uuid().safeParse(id).success) throw new Error("Invalid intent ID");
    return `${namespace}:${id}`;
  };
  /**
   * Исполняет Lua под fence поколения broker; ошибки идентичности и поколения помечает как
   * недоступность intent-generation, прочие ошибки сохраняет.
   */
  const evaluate = async (
    script: string,
    id: string,
    args: readonly string[],
  ) => {
    try {
      return await evaluateFenced({
        client,
        namespace: brokerNamespace,
        generation,
        script,
        keys: [key(id)],
        arguments: args,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /BROKER_(IDENTITY_UNAVAILABLE|NOT_BOOTSTRAPPED|GENERATION_STALE)/.test(
          error.message,
        )
      )
        throw new Error("INTENT_GENERATION_UNAVAILABLE", { cause: error });
      throw error;
    }
  };
  /**
   * Проверяет полный intent по схеме перед сериализацией для записи и точного сравнения.
   */
  const serialize = (intent: Intent) =>
    JSON.stringify(intentSchema.parse(intent));
  return {
    /**
     * Пытается создать intent через fenced Lua с оставшимся TTL не меньше миллисекунды;
     * возвращает факт успешной записи.
     */
    create: async (intent) =>
      (await evaluate(createLua, intent.intentId, [
        serialize(intent),
        String(Math.max(1, intent.expiresAt - Date.now())),
      ])) === "OK",
    /**
     * Читает intent под fence и проверяет JSON; отсутствующее значение возвращает как
     * undefined, ошибки чтения или схемы не скрывает.
     */
    find: async (id) => {
      const value = await evaluate("return redis.call('GET',KEYS[2])", id, []);
      return typeof value === "string"
        ? intentSchema.parse(JSON.parse(value))
        : undefined;
    },
    /**
     * Атомарно заменяет сохранённый intent только при совпадении сериализованного previous;
     * конфликт возвращает false.
     */
    compare: async ({ previous, next }) =>
      (await evaluate(compareLua, previous.intentId, [
        serialize(previous),
        serialize(next),
      ])) === 1,
  };
};
