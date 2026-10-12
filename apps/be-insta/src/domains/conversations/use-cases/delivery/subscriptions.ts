import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import {
  type DeliveryPosition,
  type PreparedSubscription,
  RealtimeErrorCode,
} from "@insta/contracts/realtime";
import type { Actor } from "../../../users/index";
import type {
  DeliveryAdmissionCode,
  DeliveryStream,
} from "../../ports/delivery/types";
import { activateDelivery } from "./activate";
import { prepareDelivery } from "./prepare";
import { resumeDelivery } from "./resume";
import { reusePreparedDelivery } from "./reuse";
import { runDelivery } from "./run";
import type { SubscriptionEntry, SubscriptionPorts } from "./types";

class DeliverySubscriptions {
  readonly #entries = new Map<string, SubscriptionEntry>();
  readonly #lifetime = new AbortController();
  /** Создаёт connection-owned реестр; команды этого owner сериализует gateway. */
  constructor(
    private readonly input: Readonly<{
      actor: Actor;
      ports: SubscriptionPorts;
    }>,
  ) {}
  /** Запускает одну принадлежащую подписке операцию, не ожидая её в command queue. */
  readonly #start = (entry: SubscriptionEntry) => {
    if (
      entry.state.kind !== "prepared" ||
      entry.state.active ||
      entry.lifetime.signal.aborted
    )
      return;
    entry.state.active = true;
    entry.operation = runDelivery(
      {
        actor: this.input.actor,
        target: entry.target,
        prepared: entry.state.prepared,
        signal: entry.lifetime.signal,
      },
      this.input.ports,
    );
    // Promise остаётся owned до close; ошибка запрещает повторные attempts этой подписки.
    entry.operation = entry.operation.catch(() => {
      entry.lifetime.abort();
    });
  };
  /** Проверяет новое admission и устанавливает либо переиспользует принадлежащий entry результат. */
  readonly #admit = async (
    entry: SubscriptionEntry,
    after: DeliveryPosition | undefined,
    signal: AbortSignal,
    mode: "new" | "reuse",
  ) => {
    const selection = {
      actor: this.input.actor,
      target: entry.target,
      signal: AbortSignal.any([signal, entry.lifetime.signal]),
    };
    const result = after
      ? await resumeDelivery({ ...selection, after }, this.input.ports)
      : await prepareDelivery(selection, this.input.ports);
    selection.signal.throwIfAborted();
    if (result.isError()) return result;
    if (mode === "reuse")
      return reusePreparedDelivery(entry, selection, after, this.input.ports);
    entry.state = { kind: "prepared", prepared: result.get(), active: false };
    if (after) this.#start(entry);
    return result;
  };
  /** Сначала проверяет admission даже для повторной команды; потерянный prepare ACK переиспользует тот же paused token. */
  readonly prepare = async ({
    target,
    after,
    signal,
  }: Readonly<{
    target: DeliveryStream;
    after?: DeliveryPosition;
    signal: AbortSignal;
  }>): Promise<
    Result<
      PreparedSubscription,
      DeliveryAdmissionCode | RealtimeErrorCode.RateLimited
    >
  > => {
    const key = `${target.kind}:${target.id}`;
    const existing = this.#entries.get(key);
    const ownedSignal = AbortSignal.any([signal, this.#lifetime.signal]);
    ownedSignal.throwIfAborted();
    if (existing) return this.#admit(existing, after, ownedSignal, "reuse");
    if (this.#entries.size >= this.input.ports.policy.maxSubscriptionsPerSocket)
      return Result.Error(RealtimeErrorCode.RateLimited);
    const entry: SubscriptionEntry = {
      target,
      lifetime: new AbortController(),
      mode: after ? "resume" : "snapshot",
      state: { kind: "preparing" },
      operation: Promise.resolve(),
    };
    this.#entries.set(key, entry);
    try {
      const result = await this.#admit(entry, after, ownedSignal, "new");
      if (result.isError()) this.#entries.delete(key);
      return result;
    } catch (error) {
      if (this.#entries.get(key) === entry) this.#entries.delete(key);
      throw error;
    }
  };
  /** Проверяет exact token/baseline до установки background lifecycle; повтор activate идемпотентен. */
  readonly activate = async (
    input: PreparedSubscription & Readonly<{ signal: AbortSignal }>,
  ): Promise<Result<void, DeliveryAdmissionCode>> => {
    const entry = [...this.#entries.values()].find(
      (entry) =>
        entry.state.kind === "prepared" &&
        entry.state.prepared.subscriptionId === input.subscriptionId,
    );
    if (entry?.state.kind !== "prepared")
      return Result.Error(CommonErrorCode.Forbidden);
    const signal = AbortSignal.any([
      input.signal,
      entry.lifetime.signal,
      this.#lifetime.signal,
    ]);
    const result = await activateDelivery(
      {
        ...input,
        signal,
        actor: this.input.actor,
        target: entry.target,
        prepared: entry.state.prepared,
      },
      this.input.ports,
    );
    if (result.isOk()) this.#start(entry);
    return result;
  };
  /** Немедленно закрывает captured owner и удаляет slot только после его actual settlement. */
  readonly remove = async (target: DeliveryStream) => {
    const key = `${target.kind}:${target.id}`;
    const entry = this.#entries.get(key);
    if (!entry) return;
    if (entry.closing) return entry.closing;
    entry.lifetime.abort();
    entry.closing = entry.operation.finally(() => {
      if (this.#entries.get(key) === entry) this.#entries.delete(key);
    });
    return entry.closing;
  };
  /** Останавливает все подписки сразу, затем параллельно ждёт их timers/readers/SDK ACK settlement. */
  readonly close = async () => {
    this.#lifetime.abort();
    await Promise.all(
      [...this.#entries.values()].map((entry) => this.remove(entry.target)),
    );
  };
}
/** Создаёт connection-scoped registry без framework dependency и без глобального publisher. */
export const createDeliverySubscriptions = (
  input: Readonly<{ actor: Actor; ports: SubscriptionPorts }>,
) => new DeliverySubscriptions(input);
