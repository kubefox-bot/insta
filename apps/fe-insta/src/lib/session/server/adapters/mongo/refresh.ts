import type { Collection } from "mongodb";
import { refreshLeaseMs } from "../../conts";
import type { SessionStore } from "../../ports/store";
import type { Binding } from "../../types";
import { createRefreshCommit } from "./commit-refresh";
/** Собирает операции ротации над заимствованной collection; атомарность обеспечивается фильтром каждого Mongo update, не внешней транзакцией. Ошибки Mongo не маскируются. */
export const createRefreshStore = (
  records: Collection<Binding>,
): Pick<
  SessionStore,
  "beginRefresh" | "takeOver" | "finishRefresh" | "expire"
> => ({
  /** Устанавливает попытку только на незаблокированную актуальную revision без другой попытки и с живыми сроками. Возвращает обновлённую запись либо null при проигранном захвате. */
  beginRefresh: ({ bindingId, revision, attempt, now }) =>
    records.findOneAndUpdate(
      {
        bindingId,
        revision,
        blocked: false,
        attempt: { $exists: false },
        expiresAt: { $gt: now },
        absoluteExpiresAt: { $gt: now },
      },
      { $set: { attempt } },
      { returnDocument: "after" },
    ),
  /** Перехватывает только просроченную lease той же попытки внутри recovery window, увеличивая поколение и ограничивая новый срок. При отсутствии попытки либо проигранном фильтре возвращает null. */
  takeOver: ({ binding, leaseOwner, now }) => {
    const attempt = binding.attempt;
    if (!attempt) return Promise.resolve(null);
    return records.findOneAndUpdate(
      {
        bindingId: binding.bindingId,
        revision: binding.revision,
        blocked: false,
        "attempt.key": attempt.key,
        "attempt.leaseGeneration": attempt.leaseGeneration,
        "attempt.leaseUntil": { $lte: now },
        "attempt.recoverUntil": { $gt: now },
        absoluteExpiresAt: { $gt: now },
      },
      {
        $set: {
          "attempt.leaseOwner": leaseOwner,
          "attempt.leaseUntil": Math.min(
            now + refreshLeaseMs,
            attempt.recoverUntil,
          ),
          "attempt.state": "running",
        },
        $inc: { "attempt.leaseGeneration": 1 },
      },
      { returnDocument: "after" },
    );
  },
  finishRefresh: createRefreshCommit(records),
  /** Помечает указанную revision заблокированной при истечении абсолютного срока, recovery window либо обычного срока без попытки; более новая revision этим update не затрагивается. */
  expire: async ({ bindingId, revision, now }) => {
    await records.updateOne(
      {
        bindingId,
        revision,
        blocked: false,
        $or: [
          { absoluteExpiresAt: { $lte: now } },
          { "attempt.recoverUntil": { $lte: now } },
          { attempt: { $exists: false }, expiresAt: { $lte: now } },
        ],
      },
      { $set: { blocked: true } },
    );
  },
});
