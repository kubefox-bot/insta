import type { OutboxClaim } from "../../../ports/outbox";
import { outboxDocumentSchema } from "../outbox-schema";
/** Валидирует source и исключает приватные lease/projection/retention поля из канонического события claim. */
export const mapOutboxClaim = ({
  document,
  sink,
  leaseId,
}: Readonly<{
  document: unknown;
  sink: OutboxClaim["sink"];
  leaseId: string;
}>): OutboxClaim => {
  const {
    _id,
    deliveries,
    projection,
    recoveryExpiresAt,
    recoveryTargets,
    ...event
  } = outboxDocumentSchema.parse(document);
  return { event, sink, leaseId, attempts: deliveries[sink].attempts };
};
