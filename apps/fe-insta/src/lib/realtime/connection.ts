import { codes } from "@insta/contracts/errors";
import {
  ackSchema,
  realtimeChannels,
  realtimeCommandTypes,
} from "@insta/contracts/realtime";
import type { Socket } from "socket.io-client";
import { readonly, writable } from "svelte/store";
import { connectionPolicy, connectionStates } from "./conts";
import { retryDelay } from "./retry-delay";
import { createRealtimeTransport } from "./transport";
import type {
  Command,
  ConnectionDependencies,
  ConnectionState,
  TicketOutcome,
} from "./types";

class RealtimeConnection {
  readonly #state = writable<ConnectionState>({
    kind: connectionStates.idle,
    generation: 0,
  });
  readonly viewState = readonly(this.#state);
  #generation = 0;
  #attempts = 0;
  #disposed = false;
  #stopped = false;
  #socket: Socket | undefined = undefined;
  #ticketController: AbortController | undefined = undefined;
  #timer: ReturnType<typeof setTimeout> | undefined = undefined;
  readonly #operations = new Set<Promise<void>>();
  /**
   * Сохраняет зависимости отдельного соединения; получение ticket и открытие socket
   * откладываются до connect.
   */
  constructor(private readonly dependencies: ConnectionDependencies) {}
  /**
   * Сменяет поколение, отменяет retry timer и запрос ticket, снимает listeners и
   * отключает socket. Сообщает владельцу подписок о потере поколения; abort сам по себе
   * не означает завершение запроса.
   */
  readonly #invalidate = () => {
    this.#generation++;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#ticketController?.abort();
    this.#socket?.removeAllListeners();
    this.#socket?.disconnect();
    this.#socket = undefined;
    this.dependencies.onGenerationLost();
  };
  /**
   * Инвалидирует транспорт и переводит view state в unauthorized, затем уведомляет
   * диагностику и владельца авторизации. Автоматический retry здесь не назначается.
   */
  readonly #unauthorized = () => {
    this.#stopped = true;
    this.#invalidate();
    this.#state.set({
      kind: connectionStates.unauthorized,
      generation: this.#generation,
    });
    this.dependencies.observe({ kind: "unauthorized" });
    this.dependencies.onUnauthorized();
  };
  /**
   * После инвалидирования поколения останавливается при dispose или исчерпанном бюджете
   * попыток; иначе публикует degraded и назначает следующую попытку с настроенной
   * задержкой.
   */
  readonly #retry = () => {
    this.#invalidate();
    if (this.#disposed) return;
    this.#state.set({
      kind: connectionStates.degraded,
      generation: this.#generation,
    });
    this.dependencies.observe({ kind: "retry", attempt: this.#attempts });
    if (this.dependencies.online?.() === false) return;
    const delay =
      this.dependencies.retryDelay?.(this.#attempts) ??
      retryDelay({
        attempt: this.#attempts,
        random: this.dependencies.random ?? Math.random,
      });
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#start();
    }, delay);
  };
  /** Отсутствие сессии завершает owner; временный отказ продолжает reconnect policy. */
  readonly #acceptTicket = (
    ticket: TicketOutcome,
    active: () => boolean,
    current: number,
  ) => {
    switch (ticket.kind) {
      case "unauthorized":
        this.#unauthorized();
        return;
      case "unavailable":
        this.#retry();
        return;
      case "issued": {
        this.#openTransport(ticket.ticket, active, current);
        return;
      }
    }
    return ticket satisfies never;
  };
  /** Подключает transport только после выдачи ticket текущему attempt. */
  readonly #openTransport = (
    ticket: string,
    active: () => boolean,
    current: number,
  ) => {
    const client = createRealtimeTransport({
      ticket,
      dependencies: this.dependencies,
      active,
      retry: this.#retry,
      unauthorized: this.#unauthorized,
      protocolError: this.#protocolError,
      track: this.#track,
      /**
       * При подключении активного транспорта сбрасывает бюджет попыток, публикует connected
       * для захваченного поколения и записывает наблюдение.
       */
      connected: () => {
        this.#attempts = 0;
        this.#state.set({
          kind: connectionStates.connected,
          generation: current,
        });
        this.dependencies.observe({ kind: "connected" });
      },
    });
    this.#socket = client;
    client.connect();
  };
  /**
   * Получает ticket с abort deadline и открывает транспорт лишь для текущего поколения.
   * Отказ авторизации завершает поколение, недоступность запускает retry; таймер ticket
   * снимается в finally, поздний результат отбрасывается.
   */
  readonly #attempt = async () => {
    if (this.#disposed || this.#stopped) return;
    if (this.dependencies.online?.() === false) {
      this.#retry();
      return;
    }
    this.#attempts++;
    const current = this.#generation;
    /**
     * Проверяет, что результат попытки ещё принадлежит текущему поколению и соединение не
     * закрыто.
     */
    const active = () => !this.#disposed && current === this.#generation;
    this.#state.set({ kind: connectionStates.connecting, generation: current });
    const controller = new AbortController();
    this.#ticketController = controller;
    const timeout = setTimeout(
      () => controller.abort(),
      connectionPolicy.connectionTimeoutMs,
    );
    try {
      const ticket = await this.dependencies.obtainTicket(controller.signal);
      if (!active()) return;
      if (controller.signal.aborted) {
        this.#retry();
        return;
      }
      this.#acceptTicket(ticket, active, current);
    } catch {
      if (active()) this.#retry();
    } finally {
      clearTimeout(timeout);
      if (this.#ticketController === controller)
        this.#ticketController = undefined;
    }
  };
  /**
   * Запускает попытку и учитывает её Promise до settlement, чтобы dispose мог дождаться
   * работы. Необработанный сбой попытки запускает retry, пока владелец не закрыт.
   */
  /** Учитывает callback apply до фактического settlement при dispose. */
  readonly #track = (operation: Promise<void>) => {
    this.#operations.add(operation);
    operation.then(
      () => this.#operations.delete(operation),
      () => this.#operations.delete(operation),
    );
  };
  /** Закрывает несовместимый протокол без автоматического reconnect. */
  readonly #protocolError = () => {
    this.#stopped = true;
    this.#invalidate();
    this.#state.set({
      kind: connectionStates.protocolError,
      generation: this.#generation,
      issue: codes.realtime.ProtocolUnsupported,
    });
    this.dependencies.observe({ kind: "invalid" });
  };
  /** Browser recovery не создаёт вторую попытку или timer; offline останавливает сетевую работу. */
  readonly resume = () => {
    if (this.#disposed || this.#stopped) return;
    if (this.dependencies.online?.() === false) {
      this.#invalidate();
      this.#state.set({
        kind: connectionStates.degraded,
        generation: this.#generation,
      });
      return;
    }
    if (
      this.#timer ||
      this.#socket ||
      (this.#ticketController && !this.#ticketController.signal.aborted)
    )
      return;
    this.connect();
  };
  readonly #start = () => {
    const operation = this.#attempt().catch(() => {
      if (!this.#disposed) this.#retry();
    });
    this.#operations.add(operation);
    operation.then(
      () => this.#operations.delete(operation),
      () => this.#operations.delete(operation),
    );
  };
  /**
   * Начинает новое поколение с полным бюджетом попыток, закрывая прежний транспорт; после
   * dispose повторное подключение игнорируется.
   */
  readonly connect = () => {
    if (this.#disposed || this.#stopped) return;
    this.#invalidate();
    this.#attempts = 0;
    this.#start();
  };
  /**
   * Отправляет команду с ограничением ожидания ack и проверяет его схему. Отключённый
   * socket, timeout и ack старого поколения приводят к ошибке; завершение команды не
   * входит в набор ожидаемых при dispose попыток. SESSION_REVOKED передаётся владельцу
   * авторизации через unauthorized; исходный проверенный ACK сохраняется.
   */
  readonly command = async (command: Command) => {
    const client = this.#socket;
    const current = this.#generation;
    if (!client?.connected) throw new Error("Realtime disconnected");
    const ack: unknown = await client
      .timeout(
        command.type === realtimeCommandTypes.unsubscribe ||
          command.type === realtimeCommandTypes.unreadUnsubscribe ||
          command.type === realtimeCommandTypes.storiesUnsubscribe
          ? connectionPolicy.cleanupAckTimeoutMs
          : connectionPolicy.ackTimeoutMs,
      )
      .emitWithAck(realtimeChannels.command, command);
    if (this.#disposed || current !== this.#generation)
      throw new Error("Stale subscription generation");
    const result = ackSchema.parse(ack, { jitless: true });
    if (!result.ok && result.error.code === codes.realtime.ProtocolUnsupported)
      this.#protocolError();
    if (!result.ok && result.error.code === codes.auth.SessionRevoked)
      this.#unauthorized();
    return result;
  };
  /**
   * Запрещает новые попытки, инвалидирует ресурсы и ждёт settlement учтённых попыток
   * подключения. Публикует disposed и объединяет их отклонения в AggregateError;
   * произвольные command Promise здесь не ожидаются.
   */
  readonly dispose = async () => {
    this.#disposed = true;
    this.#invalidate();
    const settled = await Promise.allSettled(this.#operations);
    this.#state.set({
      kind: connectionStates.disposed,
      generation: this.#generation,
    });
    const failures = settled.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Realtime disposal failed",
      );
  };
}
/**
 * Создаёт владельца realtime с приватным изменяемым состоянием и отдаёт readable view
 * state и операции. Вызывающий отвечает за dispose, включая ожидание его Promise.
 */
export const createConnection = (dependencies: ConnectionDependencies) => {
  const owner = new RealtimeConnection(dependencies);
  return {
    viewState: owner.viewState,
    connect: owner.connect,
    resume: owner.resume,
    command: owner.command,
    dispose: owner.dispose,
  };
};
