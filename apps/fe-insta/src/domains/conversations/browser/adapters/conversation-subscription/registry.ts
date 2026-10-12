import { RealtimeErrorCode } from "@insta/contracts/realtime";
import { get } from "svelte/store";
import { SubscriptionLifecycle } from "../../../../../lib/realtime/index";
import { conversationIssues } from "../../../conts";
import { conversationConnectionStates } from "../../conts";
import type {
  HistorySubscription,
  Message,
  SyncDependencies,
} from "../../types";
import { ConversationDelivery } from "./delivery";
import { claimRecovery } from "./recovery";
import type { Dependencies, Entry } from "./types";
/** Владеет server slots только retained histories и сериализует освобождение до admission. */
export class ConversationSubscriptions {
  readonly #entries = new Map<string, Entry>();
  readonly #closing = new Map<string, Entry>();
  readonly #settlements = new Set<Promise<void>>();
  readonly #retrying = new Map<string, Promise<void>>();
  #generation = 0;
  #disposed = false;
  #admission: Promise<unknown> = Promise.resolve();
  readonly delivery: ConversationDelivery;
  readonly handlers: ConversationDelivery["handlers"];
  /** Собирает domain delivery и recovery с локальным registry владельца. */
  constructor(private readonly dependencies: Dependencies) {
    this.delivery = new ConversationDelivery({
      ...dependencies,
      entries: this.#entries,
      owned: this.#owned,
      claim: this.#claim,
      report: this.#report,
    });
    this.handlers = this.delivery.handlers;
  }
  /** Cleanup может завершиться после dispose, но никогда не действует от следующего actor. */
  readonly #actorOwned = () => {
    const current = get(this.dependencies.store.view).actor;
    return (
      current?.userId === this.dependencies.actor.userId &&
      current.generation === this.dependencies.actor.generation
    );
  };
  /** Ограждает borrower lifetime отдельно от actor-owned cleanup. */
  readonly #owned = () => !this.#disposed && this.#actorOwned();
  /** Сохраняет ошибку только затронутой истории. */
  readonly #report = (
    id: string,
    entry: Entry,
    code: RealtimeErrorCode | undefined,
  ) => {
    if (code === RealtimeErrorCode.DeliveryBlocked) {
      entry.recoveryGeneration++;
      entry.recoveryPhase = "failed";
    }
    entry.issue = code;
    this.dependencies.store.setSubscriptionIssue(id, code);
  };
  /** Захватывает generation до wire receipt, не начиная recovery I/O. */
  readonly #claim = (id: string, entry: Entry) => {
    const attempt = this.#generation;
    return claimRecovery({
      id,
      entry,
      active: () =>
        this.#owned() &&
        attempt === this.#generation &&
        this.#entries.get(id) === entry,
      recover: this.dependencies.recover,
      report: (code) => this.#report(id, entry, code),
    });
  };
  /** Ошибка close сохраняет barrier для следующего admission. */
  readonly #drain = async () => {
    for (const [id, entry] of this.#closing) {
      await entry.lifecycle.close();
      if (this.#closing.get(id) === entry) this.#closing.delete(id);
    }
  };
  /** Последний receiver снимает target немедленно, ACK завершает освобождение slot. */
  readonly #release = (
    id: string,
    entry: Entry,
    receive: (message: Message) => void,
  ) => {
    entry.receivers.delete(receive);
    if (entry.receivers.size || this.#entries.get(id) !== entry)
      return Promise.resolve();
    this.#entries.delete(id);
    this.#closing.set(id, entry);
    const operation = entry.lifecycle.close().then(() => {
      if (this.#closing.get(id) === entry) this.#closing.delete(id);
    });
    this.#settlements.add(operation);
    operation.then(
      () => this.#settlements.delete(operation),
      () => {
        this.#settlements.delete(operation);
        this.dependencies.store.report(
          conversationIssues.subscriptionUnavailable,
        );
      },
    );
    return operation;
  };
  /** Создаёт lifetime только нового retained target. */
  readonly #entry = (id: string): Entry =>
    this.#entries.get(id) ?? {
      lifecycle: new SubscriptionLifecycle({
        command: this.dependencies.command,
        target: { kind: "conversation", id },
        current: this.#actorOwned,
        uuid: () => crypto.randomUUID(),
      }),
      receivers: new Set(),
      issue: undefined,
      recoveryPhase: "idle",
      recoveryGeneration: 0,
      recovery: null,
    };
  /** RESYNC_REQUIRED снимает прежнюю identity до получения нового baseline. */
  readonly #prepare = async (
    entry: Entry,
    receive: (message: Message) => void,
  ) => {
    try {
      await entry.lifecycle.prepare();
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          error.message === RealtimeErrorCode.ResyncRequired
        )
      ) {
        entry.receivers.delete(receive);
        throw error;
      }
      await entry.lifecycle.close();
      await entry.lifecycle.prepare();
    }
  };
  /** Сохранённый failed projection требует explicit retry даже когда snapshot cleanup удалил entry. */
  readonly #assertRecoveryIntent = (id: string) => {
    const entry = this.#entries.get(id);
    if (entry?.recoveryPhase === "failed")
      throw new Error("Explicit subscription retry required");
    const issue = get(this.dependencies.store.view).histories.get(
      id,
    )?.deliveryIssue;
    if (!entry && issue && !this.#retrying.has(id))
      throw new Error("Explicit projection retry required");
  };
  /** Новый prepare не обгоняет pending unsubscribe даже при быстрой навигации. */
  readonly #admit = async ({
    id,
    receive,
    attempt,
    options,
  }: Readonly<{
    id: string;
    receive: (message: Message) => void;
    attempt: number;
    options: Parameters<SyncDependencies["subscribe"]>[2];
  }>): Promise<HistorySubscription> => {
    if (
      !this.#owned() ||
      attempt !== this.#generation ||
      !this.dependencies.connected()
    )
      throw new Error("Realtime disconnected");
    await this.#drain();
    if (!this.#owned() || attempt !== this.#generation)
      throw new Error("Stale subscription");
    this.#assertRecoveryIntent(id);
    const entry = this.#entry(id);
    if (entry.issue === RealtimeErrorCode.DeliveryBlocked)
      throw new Error(entry.issue);
    this.#entries.set(id, entry);
    entry.receivers.add(receive);
    const cleanup = Object.assign(() => this.#release(id, entry, receive), {
      activate: () => this.#activate(id, entry, attempt),
    });
    try {
      options?.onReserved(cleanup);
    } catch (error) {
      await cleanup();
      throw error;
    }
    await this.#prepare(entry, receive);
    return cleanup;
  };
  /** Успешный owned bootstrap согласованно снимает внутренний и публичный issue; поздний claim не очищается. */
  readonly #activate = async (id: string, entry: Entry, attempt: number) => {
    if (attempt !== this.#generation || this.#entries.get(id) !== entry)
      throw new Error("Stale activation owner");
    const claim = entry.recoveryGeneration;
    await entry.lifecycle.activate();
    if (
      !this.#owned() ||
      attempt !== this.#generation ||
      this.#entries.get(id) !== entry
    )
      return;
    if (
      claim !== entry.recoveryGeneration ||
      entry.issue === RealtimeErrorCode.DeliveryBlocked
    )
      return;
    entry.recoveryPhase = "idle";
    this.#report(id, entry, undefined);
  };
  /** Только прерванный recovery допускает новый bootstrap; завершившийся отказ и blocked сохраняются. */
  readonly #interruptRecovery = (entry: Entry) => {
    if (entry.recoveryPhase !== "reserved" && entry.recoveryPhase !== "running")
      return;
    entry.recoveryPhase = "interrupted";
    entry.recoveryGeneration++;
    const pending = entry.recovery;
    entry.recovery = null;
    if (!pending) return;
    this.#settlements.add(pending);
    pending.then(
      () => this.#settlements.delete(pending),
      () => this.#settlements.delete(pending),
    );
  };
  /** Возвращает release и exact activation, которую snapshot owner вызывает после установки проекции. */
  readonly subscribe = (
    id: string,
    receive: (message: Message) => void,
    options?: Parameters<SyncDependencies["subscribe"]>[2],
  ): Promise<HistorySubscription> => {
    const attempt = this.#generation;
    const operation = this.#admission.then(() =>
      this.#admit({ id, receive, attempt, options }),
    );
    this.#admission = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
  /** Потеря transport token сохраняет только cursor действующей проекции. */
  readonly onGenerationLost = () => {
    this.#generation++;
    this.#retrying.clear();
    for (const entry of this.#entries.values()) {
      this.#interruptRecovery(entry);
      entry.lifecycle.lost();
    }
    for (const entry of this.#closing.values()) entry.lifecycle.lost();
    this.#closing.clear();
    this.dependencies.store.setConnection(
      this.dependencies.online()
        ? conversationConnectionStates.connecting
        : conversationConnectionStates.offline,
    );
  };
  /** Failed snapshot мог освободить entry; explicit retry использует тот же canonical owner и admission barrier. */
  readonly #retryMissing = (id: string) => {
    const recover = this.dependencies.recover;
    if (!this.#owned() || !recover || this.#retrying.has(id)) return;
    const generation = this.#generation;
    const active = () => this.#owned() && generation === this.#generation;
    const failed = () => {
      if (active())
        this.dependencies.store.setSubscriptionIssue(
          id,
          RealtimeErrorCode.ResyncRequired,
        );
    };
    const operation = recover(id)
      .then((result) => {
        if (result.kind !== "applied") failed();
      })
      .catch(failed)
      .finally(() => {
        if (this.#retrying.get(id) === operation) this.#retrying.delete(id);
        this.#settlements.delete(operation);
      });
    this.#retrying.set(id, operation);
    this.#settlements.add(operation);
  };
  /** Пользователь повторяет bootstrap только выбранного target. */
  readonly retry = (id: string) => {
    const entry = this.#entries.get(id);
    if (!entry) {
      this.#retryMissing(id);
      return;
    }
    if (entry.recovery) return;
    entry.recoveryPhase = "idle";
    this.#claim(id, entry)?.();
  };
  /** Закрывает owned lifetimes и ждёт фактического завершения cleanup/recovery. */
  readonly dispose = async () => {
    this.#disposed = true;
    this.#generation++;
    const operations = [...this.#entries.values()].map((entry) => {
      const closing = this.dependencies.connected()
        ? entry.lifecycle.close()
        : Promise.resolve();
      return Promise.allSettled([closing, entry.recovery]);
    });
    this.#entries.clear();
    this.#closing.clear();
    await Promise.allSettled([...operations, ...this.#settlements]);
  };
}
