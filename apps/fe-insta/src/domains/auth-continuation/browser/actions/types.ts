import type { Readable } from "svelte/store";
import type { IntentInput } from "../../domain/types";
import type { Recovery, RecoveryIdentity } from "../../ports/recovery/types";
export type ActionInput = Readonly<{
  input: IntentInput;
  trigger: HTMLElement | null;
  isSelected: () => boolean;
}>;
export type Dependencies = Readonly<{
  begin: Recovery["begin"];
  cancel: Recovery["cancel"];
  currentIdentity: () => RecoveryIdentity;
  subscribeIdentity: Readable<RecoveryIdentity>["subscribe"];
  openConversation: (input: Readonly<{ intentId: string }>) => Promise<void>;
  openStory: (
    input: Readonly<{ intentId: string; trigger: HTMLElement | null }>,
  ) => Promise<void>;
  openAuthentication: (
    input: Readonly<{ intentId: string; type: IntentInput["type"] }>,
  ) => void;
}>;
export type ActionOutcome = "applied" | "stale" | "unavailable";
export type Selection = Readonly<
  | {
      kind: "selected";
      generation: number;
      identity: RecoveryIdentity;
      isSelected: () => boolean;
    }
  | { kind: "stale" | "unavailable" }
>;
