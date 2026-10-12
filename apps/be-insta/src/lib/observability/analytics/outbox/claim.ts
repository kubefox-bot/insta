import type { GoalMapping } from "@insta/fe-core/observability/analytics";
import type { Collection } from "mongodb";
import { analyticsPolicy } from "../conts";
import { canonicalSchema } from "../schema";
import type {
  AnalyticsClaim,
  AnalyticsSinkName,
  CanonicalDocument,
  OutboxScope,
} from "../types";
/** Атомарно арендует старейшую доступную внешнюю цель; отсутствие работы даёт null, невалидная запись вызывает ошибку. */
export const claimCanonical = async ({
  documents,
  mappings,
  scope,
  sink,
  now,
  leaseId,
}: Readonly<{
  documents: Collection<CanonicalDocument>;
  mappings: readonly GoalMapping[];
  scope: OutboxScope;
  sink: AnalyticsSinkName;
  now: number;
  leaseId: string;
}>): Promise<AnalyticsClaim | null> => {
  const path = `projection.deliveries.${sink}`;
  const row = await documents.findOneAndUpdate(
    {
      ...scope,
      operation: {
        $in: mappings
          .filter(
            (mapping) =>
              mapping.goal && !mapping.operation.startsWith("internal."),
          )
          .map((mapping) => mapping.operation),
      },
      [`${path}.state`]: "pending",
      [`${path}.leaseUntil`]: { $lte: now },
      [`${path}.nextAttemptAt`]: { $lte: now },
    },
    {
      $set: {
        [`${path}.leaseId`]: leaseId,
        [`${path}.leaseUntil`]: now + analyticsPolicy.leaseMs,
      },
    },
    { sort: { occurredAt: 1 }, returnDocument: "after" },
  );
  if (!row) return null;
  const parsed = canonicalSchema.parse(row, { jitless: true });
  const mapping = mappings.find(
    (value) => value.operation === parsed.operation,
  );
  if (!mapping) throw new Error("Unenrolled canonical operation");
  const { projection, ...record } = parsed;
  return {
    id: row._id,
    record: { ...record, reference: projection.reference },
    mapping,
    sink,
    leaseId,
  };
};
