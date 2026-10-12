import type { ClientSession, Db } from "mongodb";
import { conversationPolicy } from "../../../domain/policy";
import { transactionOptions } from "../conts";
import { pruneDeliveryPrefix } from "./prune-prefix";
import { pruneDeliverySources } from "./prune-sources";
/** Владеет session ограниченной очистки; floor и удаление атомарны, source cleanup ждёт завершения всех sinks, canonical данные не меняются. */
export const pruneDeliveryJournal = async ({
  db,
  startSession,
  nowMs,
  signal,
}: Readonly<{
  db: Db;
  startSession: () => ClientSession;
  nowMs: number;
  signal?: AbortSignal;
}>): Promise<Readonly<{ removed: number }>> => {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0)
    throw new Error("Invalid delivery prune time");
  signal?.throwIfAborted();
  const session = startSession();
  try {
    const removed = await session.withTransaction(
      () =>
        pruneDeliveryPrefix({
          db,
          session,
          nowMs,
          ...(signal ? { signal } : {}),
        }),
      {
        ...transactionOptions,
        timeoutMS: conversationPolicy.transactionTimeoutMs,
      },
    );
    await pruneDeliverySources({ db, nowMs, ...(signal ? { signal } : {}) });
    return { removed };
  } finally {
    await session.endSession();
  }
};
