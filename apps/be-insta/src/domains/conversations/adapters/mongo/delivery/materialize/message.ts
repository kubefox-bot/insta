import {
  realtimeEventTypes,
  replayPayloadSchema,
} from "@insta/contracts/realtime";
import { ObjectId } from "mongodb";
import type { DeliveryPayload } from "../../../../ports/delivery/types";
import { collections } from "../../conts";
import { outboxDocumentSchema } from "../../outbox-schema";
import { messageDocumentSchema } from "../../schema";
import type { MessageDocument, OutboxDocument } from "../../types";
import { deliveryReadOptions } from "../conts";
import { replayEnvelope } from "./payload";
import { matchesUnreadRecoveryTarget } from "./target";
import type { MaterializeInput } from "./types";
/** Восстанавливает message по полной canonical identity либо проверяет адресата unread-инвалидации. */
export const materializeMessage = async ({
  db,
  event,
  signal,
}: MaterializeInput): Promise<DeliveryPayload> => {
  const source = outboxDocumentSchema.parse(
    await db
      .collection<OutboxDocument>(collections.outbox, deliveryReadOptions)
      .findOne({ _id: event.source.eventId }, { signal }),
  );
  const base = replayEnvelope({
    event,
    source,
    operationId: source.operationId,
  });
  if (event.eventType === realtimeEventTypes.unreadChanged) {
    if (!matchesUnreadRecoveryTarget(event, source.recoveryTargets))
      throw new Error("Invalid unread message target");
    return replayPayloadSchema.parse({
      ...base,
      type: event.eventType,
      data: { conversationId: source.conversationId },
    });
  }
  if (event.eventType !== realtimeEventTypes.messageCreated)
    throw new Error("Invalid message delivery type");
  const message = messageDocumentSchema.parse(
    await db
      .collection<MessageDocument>(collections.messages, deliveryReadOptions)
      .findOne(
        {
          _id: new ObjectId(source.messageId),
          conversationId: source.conversationId,
          senderId: source.actorId,
          sequence: source.sequence,
        },
        { signal },
      ),
  );
  return replayPayloadSchema.parse({
    ...base,
    type: event.eventType,
    data: {
      message: {
        id: message._id.toHexString(),
        conversationId: message.conversationId,
        authorId: message.senderId,
        text: message.text,
        sequence: message.sequence,
        createdAt: message.createdAt.toISOString(),
        ...(message.clientMessageId
          ? { clientMessageId: message.clientMessageId }
          : {}),
      },
    },
  });
};
