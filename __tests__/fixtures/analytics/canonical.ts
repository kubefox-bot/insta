import { findOwnedConversation } from "./lib/owned-conversation";
import type { CanonicalFixtureInput, OutboxDocument } from "./types";
export const readOwnedCanonical = async (input: CanonicalFixtureInput) => {
  const conversationId = await findOwnedConversation(input);
  if (!conversationId) return new Response(null, { status: 403 });
  const rows = await input.db
    .collection<OutboxDocument>("conversations_outbox")
    .find({ conversationId, actorId: input.actorId })
    .toArray();
  return Response.json(
    rows.map((row) => ({
      eventId: row.eventId,
      analyticsEventId: row.analyticsEventId,
      operationId: row.operationId,
      effectId: row.effectId,
      logOnly: row.projection?.deliveries.log_only.state,
      realtimeState: row.deliveries.realtime.state,
      realtimeAttempts: row.deliveries.realtime.attempts,
    })),
  );
};
