import type { commandSchema, eventSchema } from "@insta/contracts/realtime";
import type { ManagerOptions, Socket, SocketOptions } from "socket.io-client";
import type { z } from "zod";
import type { connectionStates } from "./conts";
import type { ApplyOutcome, DeliveryReceiver } from "./delivery/types";
export type Event = z.infer<typeof eventSchema>;
export type EventHandlers = {
  readonly [Type in Exclude<Event["type"], "stories.feed.changed">]: (
    event: Extract<Event, { type: Type }>,
  ) => ApplyOutcome | Promise<ApplyOutcome>;
};
export type RealtimeObservation = Readonly<{
  kind:
    | "connected"
    | "disconnected"
    | "retry"
    | "exhausted"
    | "unauthorized"
    | "invalid"
    | "handled";
  attempt?: number;
  type?: Event["type"];
  eventId?: string;
}>;
export type Command = z.infer<typeof commandSchema>;
export type TicketOutcome =
  | Readonly<{ kind: "issued"; ticket: string }>
  | Readonly<{ kind: "unauthorized" }>
  | Readonly<{ kind: "unavailable" }>;
export type ConnectionState = Readonly<{
  kind: (typeof connectionStates)[keyof typeof connectionStates];
  generation: number;
  issue?: import("@insta/contracts/realtime").RealtimeErrorCode;
}>;
export type ConnectionDependencies = Readonly<{
  url: string;
  obtainTicket: (signal: AbortSignal) => Promise<TicketOutcome>;
  handlers: EventHandlers;
  delivery?: DeliveryReceiver;
  online?: () => boolean;
  random?: () => number;
  observe: (value: RealtimeObservation) => void;
  onUnauthorized: () => void;
  onGenerationLost: () => void;
  retryDelay?: (attempt: number) => number;
  createSocket?: (
    url: string,
    options: Partial<ManagerOptions & SocketOptions>,
  ) => Socket;
}>;
