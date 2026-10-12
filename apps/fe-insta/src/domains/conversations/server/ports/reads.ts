import type { Result } from "@bloodyowl/boxed";
import type { z } from "zod";
import type {
  historySchema,
  listSchema,
  startSchema,
} from "../../contracts/schema";
export type ReadFailure = Readonly<{ code: string; status: number }>;
export type ConversationReads = Readonly<{
  list: (
    accessToken: string,
  ) => Promise<Result<z.infer<typeof listSchema>, ReadFailure>>;
  history: (
    input: Readonly<{
      accessToken: string;
      conversationId: string;
      cursor?: string;
      after?: number;
      limit?: number;
    }>,
  ) => Promise<Result<z.infer<typeof historySchema>, ReadFailure>>;
  start: (
    input: Readonly<{ accessToken: string; recipientId: string }>,
  ) => Promise<Result<z.infer<typeof startSchema>, ReadFailure>>;
}>;
