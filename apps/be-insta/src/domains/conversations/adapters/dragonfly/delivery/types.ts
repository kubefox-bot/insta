import type { DragonflyCommands } from "@insta/fe-core/dragonfly/server";
import type { DeliveryStreams } from "../../../ports/delivery/interfaces";
export type BlockingClient = DragonflyCommands & Readonly<{ close(): void }>;
export type StreamsDependencies = Readonly<{
  namespace: typeof import("./conts").deliveryNamespace;
  client: DragonflyCommands;
  openReader: () => Promise<BlockingClient>;
  clock: () => number;
}>;
export type StreamsReader = Pick<DeliveryStreams, "watch" | "close">;
export type ReaderWatcher = Readonly<{
  onAvailable: Parameters<DeliveryStreams["watch"]>[0]["onAvailable"];
  finish: (error?: unknown) => void;
}> & { revision: string };
export type ReaderEntry = Readonly<{
  controller: AbortController;
  watchers: Map<symbol, ReaderWatcher>;
  after: Parameters<DeliveryStreams["watch"]>[0]["after"];
  stream: Parameters<DeliveryStreams["watch"]>[0]["stream"];
}> & { task: Promise<void> };
export type ReaderRegistry = {
  readonly entries: Map<string, ReaderEntry>;
  closed: boolean;
};

export type OwnedDeliveryKey = Readonly<{
  generation: string;
  stream: import("../../../ports/delivery/types").DeliveryStream;
  suffix: string | undefined;
}>;
export type RetentionInput = Readonly<{
  lease: import("../../../ports/delivery/types").DeliveryLease;
  nowMs: number;
  signal?: AbortSignal;
}>;

export type RetentionProgress = {
  generation: string;
  cursor: string;
  remainder: string[];
};
export type RetentionTurn = Readonly<{
  nowMs: number;
  signal?: AbortSignal;
  visited: Set<string>;
}>;
