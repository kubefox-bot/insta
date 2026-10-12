import type { CommitMessageInput } from "../ports/commit-message";
import { messageSent } from "./catalog";
import type { CanonicalMessage } from "./types";
/**
 * Строит каноническое message.send событие со стабильными effect/event/operation id и
 * sequence для persistence и outbox; текста сообщения в событии нет.
 */
export const canonicalMessage = ({
  input,
  messageId,
  sequence,
}: Readonly<{
  input: CommitMessageInput;
  messageId: string;
  sequence: number;
}>): CanonicalMessage => ({
  ...messageSent,
  eventId: input.eventId,
  analyticsEventId: input.analyticsEventId,
  operationId: input.operationId,
  messageId,
  conversationId: input.conversationId,
  actorId: input.actorId,
  sequence,
  createdAt: input.createdAt,
  effectId: messageId,
  occurredAt: input.createdAt,
});
