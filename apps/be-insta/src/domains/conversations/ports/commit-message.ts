import type { Result } from "@bloodyowl/boxed";
import type { Message } from "../domain/types";
export type CommitMessageInput = Readonly<{
  actorId: string;
  conversationId: string;
  text: string;
  keyDigest?: string;
  fingerprint: string;
  clientMessageId?: string;
  operationId: string;
  eventId: string;
  analyticsEventId: string;
  createdAt: number;
}>;
export type CommitMessageOutcome =
  | Readonly<{ kind: "committed" | "replayed"; message: Message }>
  | Readonly<{ kind: "conflict" | "forbidden" | "missing" }>;
export type CommitMessage = (
  input: CommitMessageInput,
) => Promise<Result<CommitMessageOutcome, "unavailable" | "unknown">>;
