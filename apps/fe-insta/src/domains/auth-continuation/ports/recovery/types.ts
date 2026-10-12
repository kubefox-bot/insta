import type { Readable } from "svelte/store";
import type { Actor, IntentInput, ResumeTarget } from "../../domain/types";
import type { StoryPreview } from "../story-preview/interfaces";
export type RecoveryIdentity = Readonly<{
  actor: Actor | null;
  status: "guest" | "authenticated" | "pending" | "unavailable";
}>;
export type RecoverySource = Readonly<{
  capture: () =>
    | Readonly<{ actor: Actor; recipientId: string; text: string }>
    | undefined;
  restore: (
    input: Readonly<{ actor: Actor; conversationId: string; text: string }>,
  ) => void;
}>;
export type RecoveryView = Readonly<
  | { kind: "idle" }
  | { kind: "creating" }
  | {
      kind: "ready";
      intentId: string;
      expiresAt: number;
    }
  | { kind: "unavailable" }
>;
export type Recovery = Readonly<{
  view: Readable<RecoveryView>;
  begin: (
    input: Readonly<{ input: IntentInput }>,
  ) => Promise<Readonly<{ intentId: string; expiresAt: number }> | undefined>;
  connectStory: (source: StoryPreview) => () => void;
  chooseAuthentication: (
    input: Readonly<{ mode: "login" | "register"; intentId?: string | null }>,
  ) => void;
  confirmRegistration: (intentId?: string | null) => void;
  connect: (source: RecoverySource) => () => void;
  explicitLogout: (identity: RecoveryIdentity) => void;
  suspend: (identity: RecoveryIdentity) => void;
  reconcile: (identity: RecoveryIdentity) => void;
  restore: (
    input: Readonly<{ intentId: string; target: ResumeTarget; actor: Actor }>,
  ) => void;
  reject: (intentId: string) => void;
  cancel: (intentId?: string | null) => Promise<void>;
  dispose: () => void;
}>;
export type RecoveryDependencies = Readonly<{
  onCleanupFailure?: () => void;
  pending: Readonly<{
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
  create: (
    input: IntentInput,
  ) => Promise<Readonly<{ intentId: string; expiresAt: number }> | undefined>;
  cancel: (intentId: string) => Promise<boolean>;
  uuid: () => string;
}>;
