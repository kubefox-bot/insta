import type { Actor } from "../domain/types";
export type WsTickets = Readonly<{
  issue: (
    input: Readonly<{ ticket: string; actor: Actor; expiresAt: number }>,
  ) => Promise<void>;
  consume: (
    input: Readonly<{ ticket: string; now: number }>,
  ) => Promise<Actor | null>;
}>;
