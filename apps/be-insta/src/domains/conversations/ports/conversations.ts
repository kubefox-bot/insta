import type { Result } from "@bloodyowl/boxed";
import type { History, HistoryRange } from "../domain/history/types";
import type {
  ConversationError,
  ConversationList,
  StartOutcome,
} from "../domain/types";
export type Conversations = Readonly<{
  startPair: (
    input: Readonly<{
      participantIds: readonly [string, string];
      operationId: string;
    }>,
  ) => Promise<Result<StartOutcome, ConversationError>>;
  listUnread: (
    input: Readonly<{ actorId: string; limit: number }>,
  ) => Promise<Result<ConversationList, ConversationError>>;
  history: (
    input: Readonly<{
      actorId: string;
      conversationId: string;
      range: HistoryRange;
      limit: number;
    }>,
  ) => Promise<Result<History, ConversationError>>;
}>;
