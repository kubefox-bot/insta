import type { ConversationActor } from "../types";
export type DraftIdentity = Readonly<{
  actor: ConversationActor | null;
  status: "authenticated" | "guest" | "pending" | "unavailable";
}>;

export type PendingDrafts = Readonly<{
  remember: (
    input: Readonly<{
      intentId: string;
      text: string;
      expectedUserId?: string;
    }>,
  ) => void;
  take: (
    input: Readonly<{ intentId: string; actorId: string }>,
  ) => string | undefined;
  cancel: (intentId: string) => void;
  dispose: () => void;
}>;
