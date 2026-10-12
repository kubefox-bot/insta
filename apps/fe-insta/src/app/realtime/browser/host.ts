import { get, readonly, writable } from "svelte/store";
import type { ConversationActor } from "../../../domains/conversations/browser/index";
import {
  type ConnectionState,
  connectionStates,
} from "../../../lib/realtime/index";
import { createAccountStream } from "./account-stream";
import { createBorrowedDelivery } from "./delivery";
import { createBorrowedHandlers } from "./handlers";
import { mountRealtimeRecovery } from "./recovery";
import type {
  RealtimeBorrower,
  RealtimeHost,
  RealtimeHostDependencies,
} from "./types";

class HostOwner {
  readonly #state = writable<ConnectionState>({
    kind: connectionStates.idle,
    generation: 0,
  });
  readonly #listeners = new Set<RealtimeBorrower>();
  #actor: ConversationActor | null = null;
  #stream: ReturnType<typeof createAccountStream> | null = null;
  /**
   * Проверяет принадлежность заимствованного listener текущим userId и generation account host.
   */
  readonly #owned = (candidate: ConversationActor) =>
    candidate.userId === this.#actor?.userId &&
    candidate.generation === this.#actor.generation;
  readonly #handlers = createBorrowedHandlers({
    listeners: this.#listeners,
    owned: this.#owned,
  });
  readonly #delivery = createBorrowedDelivery({
    listeners: this.#listeners,
    owned: this.#owned,
  });
  /**
   * Сохраняет заимствованные auth/unread и фабрику транспорта; подключение начнётся при mount и
   * появлении actor.
   */
  constructor(private readonly dependencies: RealtimeHostDependencies) {}
  /**
   * При смене actor освобождает старый account stream, сбрасывает connection state и создаёт
   * новый поток только для ненулевого actor.
   */
  readonly #reconcile = (next: ConversationActor | null) => {
    if (next && this.#owned(next)) return;
    this.#stream?.dispose();
    this.#actor = next;
    this.#stream = null;
    this.#state.set({ kind: connectionStates.idle, generation: 0 });
    if (!next) return;
    this.#stream = createAccountStream({
      ...this.dependencies,
      handlers: this.#handlers,
      delivery: this.#delivery,
      state: this.#state,
      /**
       * Уведомляет о потере transport generation только listeners текущего actor.
       */
      onGenerationLost: () => {
        for (const listener of this.#listeners)
          if (this.#owned(listener.actor)) listener.onGenerationLost();
      },
    });
    this.#stream.connection.connect();
  };
  /**
   * На connected восстанавливает unread subscription, а на idle/degraded/exhausted повторно
   * подключает имеющийся stream.
   */
  readonly #resume = () => {
    this.#stream?.connection.resume();
    const kind = get(this.#state).kind;
    if (kind === connectionStates.connected) {
      this.#stream?.resumeSubscription();
      return;
    }
  };
  /**
   * Следит за auth actor и browser recovery событиями; возвращённый teardown снимает подписки,
   * закрывает account stream и удаляет всех borrowers.
   */
  readonly mount: RealtimeHost["mount"] = (targets) => {
    const release = this.dependencies.auth.view.subscribe((value) =>
      this.#reconcile(value.actor),
    );
    const releaseRecovery = mountRealtimeRecovery({
      ...targets,
      resume: this.#resume,
    });
    return () => {
      release();
      releaseRecovery();
      this.#stream?.dispose();
      this.#actor = null;
      this.#stream = null;
      this.#listeners.clear();
    };
  };
  /**
   * Выдаёт listener порт общего account соединения; consumer освобождает только своё участие, а
   * lifetime транспорта остаётся у host.
   */
  /** Явно повторяет только account unread bootstrap. */
  readonly retryUnread = () => this.#stream?.retryUnread();
  readonly borrow: RealtimeHost["borrow"] = (options) => {
    this.#listeners.add(options);
    return {
      viewState: readonly(this.#state),
      /**
       * Отклоняет команду после смены actor или отсутствия stream; в остальных случаях передаёт её
       * общему соединению.
       */
      resume: () => {
        if (this.#owned(options.actor)) this.#stream?.connection.resume();
      },
      command: (command) => {
        if (!this.#stream || !this.#owned(options.actor))
          return Promise.reject(new Error("Realtime actor changed"));
        return this.#stream.connection.command(command);
      },
      /**
       * Повторяет подключение только для текущего actor и состояний idle/exhausted/unauthorized; не
       * создаёт отдельный транспорт borrower.
       */
      connect: () => {
        if (!this.#owned(options.actor) || !this.#stream) return;
        const kind = get(this.#state).kind;
        if (
          kind === connectionStates.idle ||
          kind === connectionStates.exhausted ||
          kind === connectionStates.unauthorized
        )
          this.#stream.connection.connect();
      },
      /**
       * Удаляет только этого borrower и инвалидирует его generation; общий account stream остаётся
       * доступным остальным потребителям.
       */
      dispose: async () => {
        this.#listeners.delete(options);
        options.onGenerationLost();
      },
    };
  };
}
/**
 * Создаёт browser host с приватным connection state; вызывающий должен владеть mount и
 * возвращённым освобождением.
 */
export const createRealtimeHost = (
  dependencies: RealtimeHostDependencies,
): RealtimeHost => new HostOwner(dependencies);
