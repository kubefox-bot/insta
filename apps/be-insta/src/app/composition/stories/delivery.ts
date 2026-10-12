import {
  realtimeEventTypes,
  realtimeKinds,
  realtimeProtocolVersion,
} from "@insta/contracts/realtime";
import { materializeDelivery } from "../../../domains/conversations/index";
import {
  completeFeedNotification,
  recordFeedNotification,
} from "../../../domains/conversations/server/index";
import { createStoriesPersistence } from "../../../domains/stories/server/index";
import type { connectDatabase } from "../../../lib/database/index";
import { readAnalyticsReference } from "../../../lib/observability/analytics/index";
import type { createConversationsDependencies } from "../conversations/index";
/** Connects the Stories transaction/outbox to the public durable-delivery adapters. */
export const createStoryDelivery = async ({
  database,
  realtime,
}: Readonly<{
  database: Awaited<ReturnType<typeof connectDatabase>>;
  realtime: Awaited<
    ReturnType<typeof createConversationsDependencies>
  >["realtime"];
}>) => {
  const record = async ({
    session,
    event,
  }: Parameters<
    NonNullable<
      Parameters<typeof createStoriesPersistence>[0]["recordPublication"]
    >
  >[0]) =>
    recordFeedNotification({
      db: database.apiDb,
      session,
      retentionMs: realtime.policy.retentionMs,
      serverNowMs: Date.now(),
      payload: {
        version: realtimeProtocolVersion,
        kind: realtimeKinds.event,
        type: realtimeEventTypes.storiesChanged,
        eventId: event.eventId,
        occurredAt: new Date(event.occurredAt).toISOString(),
        meta: { requestId: event.eventId, operationId: event.operationId },
        data: {},
      },
    });
  const persistence = await createStoriesPersistence({
    db: database.apiDb,
    startSession: database.startSession,
    analyticsReference: readAnalyticsReference,
    recordPublication: record,
    acknowledgePublication: ({ session, eventId }) =>
      completeFeedNotification({ db: database.apiDb, session, eventId }),
  });
  return {
    persistence,
    notify: async ({
      eventId,
      signal,
    }: Readonly<{ eventId: string; signal: AbortSignal }>) => {
      await materializeDelivery(
        { source: { kind: "notification", eventId }, signal },
        {
          journal: realtime.journal,
          streams: realtime.streams,
          clock: Date.now,
        },
      );
    },
  };
};
