import type { DeliveryPosition } from "@insta/contracts/realtime";
import type {
  DeliveryPage,
  DeliveryPayload,
  DeliveryRange,
  DeliverySource,
  DeliveryStream,
  SourceDeliveries,
  StoredDelivery,
} from "./types";
export interface DeliveryJournal {
  range(
    input: Readonly<{
      stream: DeliveryStream;
      nowMs: number;
      signal?: AbortSignal;
    }>,
  ): Promise<DeliveryRange>;
  prune(
    input: Readonly<{ nowMs: number; signal?: AbortSignal }>,
  ): Promise<Readonly<{ removed: number }>>;
  forSource(
    input: Readonly<{
      source: DeliverySource;
      nowMs: number;
      signal?: AbortSignal;
    }>,
  ): Promise<SourceDeliveries>;
  head(
    input: Readonly<{ stream: DeliveryStream; signal?: AbortSignal }>,
  ): Promise<DeliveryPosition>;
  read(
    input: Readonly<{
      after: DeliveryPosition;
      limit: number;
      nowMs: number;
      signal?: AbortSignal;
    }>,
  ): Promise<DeliveryPage>;
  materialize(
    input: Readonly<{ event: StoredDelivery; signal?: AbortSignal }>,
  ): Promise<DeliveryPayload>;
}

export interface DeliveryStreams {
  /** Последовательный bounded round owner: trim только expired prefix текущего поколения, без продления TTL; ждёт освобождения аренды при отмене. */
  retain(
    input: Readonly<{ nowMs: number; signal?: AbortSignal }>,
  ): Promise<void>;
  acquire(
    input: Readonly<{ stream: DeliveryStream; signal?: AbortSignal }>,
  ): Promise<import("./types").DeliveryLease>;
  begin(
    input: Readonly<{
      lease: import("./types").DeliveryLease;
      after: DeliveryPosition;
      signal?: AbortSignal;
    }>,
  ): Promise<DeliveryPosition>;
  append(
    input: Readonly<{
      lease: import("./types").DeliveryLease;
      event: import("./types").MaterializedDelivery;
      signal?: AbortSignal;
    }>,
  ): Promise<"appended" | "duplicate" | "gap">;
  publishReady(
    input: Readonly<{
      lease: import("./types").DeliveryLease;
      head: DeliveryPosition;
      expiresAt: number;
      signal?: AbortSignal;
    }>,
  ): Promise<void>;
  release(
    input: Readonly<{ lease: import("./types").DeliveryLease }>,
  ): Promise<void>;
  inspect(
    input: Readonly<{ after: DeliveryPosition; signal?: AbortSignal }>,
  ): Promise<import("./types").StreamsState>;
  read(
    input: Readonly<{
      after: DeliveryPosition;
      limit: number;
      signal?: AbortSignal;
    }>,
  ): Promise<import("./types").StreamsPage>;
  /** Lifetime подписки: завершается после освобождения её reader; последний subscriber ждёт закрытия соединения.
   * Callback awaited последовательно: только быстро планирует работу своего subscription owner,
   * не ждёт browser ACK или завершения доставки, чтобы не задерживать остальных subscribers. */
  watch(
    input: Readonly<{
      stream: DeliveryStream;
      after: DeliveryPosition;
      onAvailable: (notice: import("./types").StreamNotice) => Promise<void>;
      signal: AbortSignal;
    }>,
  ): Promise<void>;
  close(): Promise<void>;
}

export interface DeliveryTarget {
  /** Завершается только после фактического SDK settlement, даже при отмене signal. */
  send(
    input: Readonly<{
      unit: import("@insta/contracts/realtime").DeliveryUnit;
      signal: AbortSignal;
    }>,
  ): Promise<import("../../domain/delivery/types").SendOutcome>;
  /** Receipt подтверждает установку notice state, не business cursor. */
  notify(
    input: Readonly<{
      notice: import("@insta/contracts/realtime").DeliveryNotice;
      signal: AbortSignal;
    }>,
  ): Promise<"received" | "retry" | "closed">;
}
