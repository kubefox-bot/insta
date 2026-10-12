import { z } from "zod";
import { webSessionHeaders } from "../../../../lib/session/contracts/index";
import { directorySchema } from "../../contracts/directory";
import type { Actor } from "../types";
/**
 * Ищет пользователей через BFF с userId и поколением ожидаемого actor, сигналом отмены и без
 * кеша; возвращает проверенные элементы, а HTTP-ошибку отклоняет.
 */
export const searchDirectory = async ({
  q,
  actor,
  signal,
}: Readonly<{ q: string; actor: Actor; signal: AbortSignal }>) => {
  const response = await fetch(`/api/users?q=${encodeURIComponent(q)}`, {
    signal,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      [webSessionHeaders.ownerId]: actor.userId,
      [webSessionHeaders.generation]: actor.generation,
    },
  });
  if (!response.ok) throw new Error("DIRECTORY_UNAVAILABLE");
  const raw: unknown = await response.json();
  return z
    .object({ ok: z.literal(true), data: directorySchema })
    .parse(raw, { jitless: true }).data.items;
};
