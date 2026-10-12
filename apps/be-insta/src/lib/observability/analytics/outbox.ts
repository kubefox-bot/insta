import type { GoalMapping } from "@insta/fe-core/observability/analytics";
import type { Db } from "mongodb";
import { analyticsPolicy } from "./conts";
import { claimCanonical } from "./outbox/claim";
import type {
  AnalyticsClaim,
  CanonicalDocument,
  CanonicalOutbox,
  OutboxScope,
} from "./types";
/** Создаёт Mongo outbox для выбранной коллекции и scope; обновления доставки ограничены текущим lease. */
export const createCanonicalOutbox = ({
  db,
  collection,
  mappings,
  scope = {},
}: Readonly<{
  db: Db;
  collection: string;
  mappings: readonly GoalMapping[];
  scope?: OutboxScope;
}>): CanonicalOutbox => {
  const documents = db.collection<CanonicalDocument>(collection);
  /** Ограничивает изменение записи её scope, pending-состоянием, sink и идентификатором владельца lease. */
  const owned = (claim: AnalyticsClaim) => ({
    ...scope,
    _id: claim.id,
    [`projection.deliveries.${claim.sink}.state`]: "pending",
    [`projection.deliveries.${claim.sink}.leaseId`]: claim.leaseId,
  });
  return {
    /** Получает следующий доступный analytics claim только в scope этого outbox. */
    claim: (input) => claimCanonical({ ...input, documents, mappings, scope }),
    /** Завершает доставку при совпадении lease; false означает, что запись уже не принадлежит этому claim. */
    finish: async ({ claim, state, now }) =>
      (
        await documents.updateOne(owned(claim), {
          $set: {
            [`projection.deliveries.${claim.sink}.state`]: state,
            [`projection.deliveries.${claim.sink}.leaseUntil`]: 0,
            [`projection.deliveries.${claim.sink}.finishedAt`]: now,
          },
          $unset: { [`projection.deliveries.${claim.sink}.leaseId`]: "" },
        })
      ).modifiedCount === 1,
    /** Освобождает принадлежащий claim и откладывает повторную доставку на policy-интервал. */
    retry: async ({ claim, now }) => {
      await documents.updateOne(owned(claim), {
        $set: {
          [`projection.deliveries.${claim.sink}.nextAttemptAt`]:
            now + analyticsPolicy.retryMs,
          [`projection.deliveries.${claim.sink}.leaseUntil`]: 0,
        },
        $unset: { [`projection.deliveries.${claim.sink}.leaseId`]: "" },
      });
    },
  };
};
