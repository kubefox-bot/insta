import type { ackSchema, commandSchema } from "@insta/contracts/realtime";
import type { z } from "zod";
import type { RuntimeObservability } from "../observability/index";
export type RealtimeCommand = z.infer<typeof commandSchema>;
export type RealtimeAck = z.infer<typeof ackSchema>;
export type CommandCompletion = Readonly<{
  code: string;
  outcome: "succeeded" | "rejected" | "failed";
}>;
export type CommandObserver = <T>(
  input: Readonly<{
    type: string;
    classify: (result: T) => CommandCompletion;
    operationId?: string;
    execute: (
      meta: Readonly<{ requestId: string; operationId?: string }>,
    ) => Promise<T>;
  }>,
) => Promise<T>;
export type ObserverDependencies = Readonly<{
  observability?: RuntimeObservability;
  uuid: () => string;
  clock?: () => number;
}>;
