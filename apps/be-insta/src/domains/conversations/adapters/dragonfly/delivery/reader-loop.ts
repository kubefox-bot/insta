import { z } from "zod";
import { streamsPolicy } from "./conts";
import { readerKey } from "./keys";
import { notifyReaders } from "./reader-notice";
import type { ReaderEntry, StreamsDependencies } from "./types";

/** Проверяет ответ XREAD перед продвижением собственного cursor; пустой BLOCK не означает полноту canonical журнала. */
const nextCursor = (rows: unknown, current: number) => {
  if (rows === null) return current;
  const parsed = z
    .array(
      z.tuple([
        z.string(),
        z.array(z.tuple([z.string(), z.array(z.string())])),
      ]),
    )
    .parse(rows);
  const id = parsed[0]?.[1].at(-1)?.[0];
  if (!id) return current;
  const cursor = Number(id.split("-")[0]);
  if (!Number.isSafeInteger(cursor) || cursor < current)
    throw new Error("Invalid blocking stream cursor");
  return cursor;
};
/** Держит отдельный BLOCK client; timeout проверяет generation/integrity даже без новых business events. */
export const runReader = async (
  entry: ReaderEntry,
  dependencies: StreamsDependencies,
) => {
  const client = await dependencies.openReader();
  /** Закрывает исключительно соединение текущего blocking reader, разблокируя pending XREAD. */
  const close = () => client.close();
  entry.controller.signal.addEventListener("abort", close, { once: true });
  let generation = "";
  let cursor = entry.after.cursor;
  try {
    while (!entry.controller.signal.aborted) {
      generation = await notifyReaders(entry, generation, dependencies);
      if (!entry.watchers.size) break;
      const rows = await client.send("XREAD", [
        "BLOCK",
        String(streamsPolicy.blockMs),
        "COUNT",
        "1",
        "STREAMS",
        readerKey({ generation, stream: entry.stream }),
        `${cursor}-0`,
      ]);
      cursor = nextCursor(rows, cursor);
    }
  } catch (error) {
    if (!entry.controller.signal.aborted) throw error;
  } finally {
    entry.controller.signal.removeEventListener("abort", close);
    client.close();
  }
};
