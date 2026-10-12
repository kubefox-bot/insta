import type { Collection } from "mongodb";
import type { SessionStore } from "../../ports/store";
import type { Binding } from "../../types";
/** Создаёт CAS-фиксацию refresh над заимствованной collection: revision, ключ, поколение lease и recovery window ограждают поздний ответ. Success заменяет credentials и снимает попытку, rejected блокирует запись, unknown сохраняет попытку и освобождает lease для восстановления; boolean отражает matched/modified исход записи. */
export const createRefreshCommit =
  (records: Collection<Binding>): SessionStore["finishRefresh"] =>
  async ({ bindingId, revision, key, leaseGeneration, now, outcome }) => {
    const filter = {
      bindingId,
      revision,
      blocked: false,
      "attempt.key": key,
      "attempt.leaseGeneration": leaseGeneration,
      "attempt.recoverUntil": { $gt: now },
      absoluteExpiresAt: { $gt: now },
    };
    switch (outcome.kind) {
      case "success": {
        const result = await records.updateOne(
          {
            ...filter,
            absoluteExpiresAt: { $gte: outcome.expiresAt, $gt: now },
          },
          {
            $set: {
              credentials: outcome.credentials,
              accessExpiresAt: outcome.accessExpiresAt,
              expiresAt: outcome.expiresAt,
            },
            $inc: { revision: 1 },
            $unset: { attempt: "" },
          },
        );
        return result.modifiedCount === 1;
      }
      case "rejected": {
        const result = await records.updateOne(filter, {
          $set: { blocked: true },
          $unset: { attempt: "" },
        });
        return result.modifiedCount === 1;
      }
      case "unknown": {
        const result = await records.updateOne(filter, {
          $set: { "attempt.state": "unknown", "attempt.leaseUntil": now },
        });
        return result.matchedCount === 1;
      }
    }
  };
