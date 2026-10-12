import type { Result } from "@bloodyowl/boxed";
import type { Actor } from "../../../domain/types";
export type ConversationTargetSource = Readonly<{
  start: (
    input: Readonly<{ recipientId: string; actor: Actor }>,
  ) => Promise<
    Result<
      Readonly<{ id: string; participantIds: readonly string[] }>,
      Readonly<{ code: string; status: number }>
    >
  >;
}>;
