import type { ContinuationErrorCode } from "@insta/contracts/errors";
import type { z } from "zod";
import type { intentTypes } from "./conts";
import type { resumeTargetSchema } from "./target";
export type IntentInput = Readonly<{
  type: (typeof intentTypes)[number];
  recipientId?: string;
  operationId: string;
}>;
export type Intent = IntentInput &
  Readonly<{
    intentId: string;
    context: string;
    expectedUserId?: string;
    createdAt: number;
    expiresAt: number;
    state: "pending" | "consumed" | "cancelled";
    actorId?: string;
    actorGeneration?: string;
    target?: ResumeTarget;
  }>;
export type Actor = Readonly<{ userId: string; generation: string }>;
export type ResumeTarget = Readonly<z.output<typeof resumeTargetSchema>>;
export type ConversationTarget = Extract<
  ResumeTarget,
  { type: "open_conversation" | "compose_message" }
>;
export type StoryTarget = Extract<
  ResumeTarget,
  { type: "create_story" | "resume_story" }
>;
export type IntentError =
  | ContinuationErrorCode.IntentUnavailable
  | ContinuationErrorCode.IntentInvalid;
