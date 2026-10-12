import type { QueueActor } from "../domain/types";
export type OutboxAuth = Readonly<{
  current: () => QueueActor | null;
  reconcile: (options?: Readonly<{ signal?: AbortSignal }>) => Promise<void>;
  online: () => boolean;
}>;
export type OutboxLocks = Readonly<{
  run: <T>(ownerId: string, execute: () => Promise<T>) => Promise<T | null>;
}>;
