import type { Collection } from "mongodb";
import { revocationBatchSize } from "../../conts";
import type { SessionStore } from "../../ports/store";
import type { Binding } from "../../types";
/** Собирает устойчивую очередь отзыва над заимствованной collection. Pending-записи исключаются из TTL, подтверждённым возвращается cleanupAt; Mongo lifecycle остаётся у composition. */
export const createRevocationStore = (
  records: Collection<Binding>,
): Pick<
  SessionStore,
  "beginRevocation" | "pendingRevocations" | "finishRevocation"
> => ({
  /** При первом отзыве блокирует привязку, сохраняет ключ и снимает cleanupAt, затем перечитывает запись. Повторный вызов сохраняет существующий ключ; update и чтение не образуют транзакцию. */
  beginRevocation: async ({ bindingId, key, now }) => {
    await records.updateOne(
      {
        bindingId,
        revocation: { $exists: false },
        revocationConfirmed: { $ne: true },
      },
      {
        $set: {
          blocked: true,
          revocation: { key, nextAttemptAt: now, failures: 0 },
        },
        $unset: { cleanupAt: "" },
      },
    );
    return records.findOne({ bindingId });
  },
  /** Читает ограниченную пачку наступивших попыток по времени следующего запуска; записи не захватываются в lease, поэтому параллельные workers используют сохранённый ключ идемпотентности. */
  pendingRevocations: (now) =>
    records
      .find({ "revocation.nextAttemptAt": { $lte: now } })
      .sort({ "revocation.nextAttemptAt": 1 })
      .limit(revocationBatchSize)
      .toArray(),
  /** По ключу отзыва сохраняет подтверждение и TTL либо переносит повтор с CAS по числу failures. Подтверждённая запись остаётся blocked; отсутствие совпадения фильтра не превращается в ошибку. */
  finishRevocation: async ({
    bindingId,
    key,
    failures,
    nextAttemptAt,
    confirmed,
  }) => {
    const filter = { bindingId, "revocation.key": key };
    if (confirmed) {
      // A confirmed record stays blocked; only pending records prohibit physical cleanup.
      await records.updateOne(filter, {
        $unset: { revocation: "", attempt: "" },
        $set: { cleanupAt: new Date(nextAttemptAt), revocationConfirmed: true },
      });
      return;
    }
    await records.updateOne(
      { ...filter, "revocation.failures": failures },
      {
        $set: { "revocation.nextAttemptAt": nextAttemptAt },
        $inc: { "revocation.failures": 1 },
      },
    );
  },
});
