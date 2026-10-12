import type { ConversationStore } from "../types";
import type { ConversationState } from "./state";
export type SynchronizationInput = Parameters<
  ConversationStore["synchronize"]
>[0];
export type HistoryOperation = NonNullable<
  ReturnType<ConversationState["begin"]>
>;
export type SynchronizationPhase = { reading: boolean };
