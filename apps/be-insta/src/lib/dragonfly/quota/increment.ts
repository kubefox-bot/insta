import type { DragonflyCommands } from "@insta/fe-core/dragonfly/server";
import { z } from "zod";
import { evaluateFenced } from "../generation";
import { quotaLua } from "./conts";

const counterSchema = z.tuple([
  z.number().int().positive(),
  z.number().int().positive(),
]);
/** Атомарно увеличивает fenced-счётчик и возвращает его значение вместе с оставшимся TTL окна. */
export const incrementWindow = async ({
  client,
  generation,
  key,
  windowMs,
}: Readonly<{
  client: DragonflyCommands;
  generation: string;
  key: string;
  windowMs: number;
}>) => {
  const [count, ttlMs] = counterSchema.parse(
    await evaluateFenced({
      client,
      generation,
      script: quotaLua,
      keys: [key],
      arguments: [String(windowMs)],
    }),
  );
  return { count, ttlMs };
};
