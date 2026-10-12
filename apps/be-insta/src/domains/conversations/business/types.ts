export type CanonicalMessage = Readonly<{
  eventId: string;
  analyticsEventId: string;
  kind: "message_sent";
  operation: "message.send";
  authority: "server_canonical";
  operationId: string;
  messageId: string;
  conversationId: string;
  actorId: string;
  sequence: number;
  createdAt: number;
  code?: "MESSAGE_PERSISTED" | undefined;
  goal?: "message_sent" | undefined;
  effectId?: string | undefined;
  occurredAt?: number | undefined;
}>;
