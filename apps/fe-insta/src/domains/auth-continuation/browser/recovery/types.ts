import type { Writable } from "svelte/store";
import type { Actor, IntentInput } from "../../domain/types";
import type {
  RecoveryDependencies,
  RecoveryIdentity,
  RecoverySource,
  RecoveryView,
} from "../../ports/recovery/types";
import type { StoryPreview } from "../../ports/story-preview/interfaces";
export type RecoveryPayloadState = {
  source?: RecoverySource;
  storyPreview?: StoryPreview;
  suspended?: Readonly<
    | { kind: "message"; actor: Actor; recipientId: string; key: string }
    | { kind: "story"; actor: Actor; previewId: string; key: string }
  >;
};
export type RecoveryState = {
  selectedInput?: IntentInput;
  selection?: Promise<
    Readonly<{ intentId: string; expiresAt: number }> | undefined
  >;
  identity: RecoveryIdentity;
  epoch: number;
  creating: boolean;
  disposed: boolean;
  blockedGeneration?: string;
  registrationSelection?: Readonly<{
    intentId: string;
    phase: "chosen" | "confirmed";
  }>;
  metadataActor?: Actor;
};
export type RecoveryOperations = RecoveryDependencies &
  Readonly<{
    state: RecoveryState;
    payload: RecoveryPayloadState;
    now: () => number;
    expire: (expiresAt: number) => void;
    view: Writable<RecoveryView>;
    retire: () => void;
    discardAll: () => void;
  }>;
