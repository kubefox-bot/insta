import type { CanonicalMessage } from "../business/types";
import type { PublicationOutcome } from "./delivery/types";
export type OutboxSink = "realtime" | "analytics";
export type OutboxClaim = Readonly<{
  event: CanonicalMessage;
  sink: OutboxSink;
  leaseId: string;
  attempts: number;
}>;
export type MessageOutbox = Readonly<{
  claim: (
    input: Readonly<{ sink: OutboxSink; now: number; leaseId: string }>,
  ) => Promise<OutboxClaim | null>;
  complete: (
    input: OutboxClaim & Readonly<{ now: number }>,
  ) => Promise<boolean>;
  expire?: (input: OutboxClaim & Readonly<{ now: number }>) => Promise<boolean>;
  fail: (
    input: OutboxClaim & Readonly<{ nextAttemptAt: number }>,
  ) => Promise<boolean>;
}>;
/**
 * Own the publication and all acquired resources. Support cancellation through
 * signal; resolve or reject only after publication I/O and resource cleanup have
 * actually settled. Before activation, concrete adapters must prove bounded
 * cancellation/cleanup. An uncooperative pending operation retains its slot and
 * blocks further claims; a deadline cannot forcibly settle an arbitrary Promise.
 */
export type MessageSink = (
  input: Readonly<{ event: CanonicalMessage; signal: AbortSignal }>,
) => Promise<void> | Promise<PublicationOutcome>;
export type MessageSinks = Readonly<Partial<Record<OutboxSink, MessageSink>>>;
