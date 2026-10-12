import type { RealtimeErrorCode } from "@insta/contracts/realtime";
import { get, readonly, writable } from "svelte/store";
import { ownListRequestTimeoutMs } from "../list/conts";
import type { ConversationActor } from "../types";
import { classifyUnreadFailure } from "./classify-failure";
import { timeoutFailure } from "./conts";
import type {
  UnreadDependencies,
  UnreadList,
  UnreadRefreshOutcome,
  UnreadSummary,
  UnreadSummaryView,
} from "./types";

class SummaryOwner {
  readonly #state = writable<UnreadSummaryView>({
    actor: null,
    list: null,
    stale: false,
  });
  readonly view = readonly(this.#state);
  #epoch = 0;
  #disposed = false;
  #controller: AbortController | null = null;
  #pending: Promise<void> | null = null;
  #repeat = false;
  #appliedVersion = 0;
  /** Сохраняет зависимости чтения и видимости для отдельного владельца unread-сводки; запросы при создании не запускает. */
  constructor(private readonly dependencies: UnreadDependencies) {}
  /** Проверяет userId и generation владельца текущей сводки. */
  #sameActor(actor: ConversationActor) {
    const current = get(this.#state).actor;
    return (
      current?.userId === actor.userId &&
      current.generation === actor.generation
    );
  }
  /** Инвалидирует эпоху, запрашивает отмену чтения и удаляет actor, список и отложенный повтор; поздний ответ больше не принимается. */
  clear = () => {
    this.#epoch += 1;
    this.#controller?.abort();
    this.#controller = null;
    this.#pending = null;
    this.#repeat = false;
    this.#state.set({ actor: null, list: null, stale: false });
  };
  /** При смене actor очищает приватную сводку и устанавливает нового владельца, если объект не уничтожен. */
  reconcileActor = (actor: ConversationActor | null) => {
    if (actor && this.#sameActor(actor)) return;
    this.clear();
    if (!this.#disposed && actor)
      this.#state.set({ actor, list: null, stale: false });
  };
  /** Заполняет ещё пустую сводку исходными данными только для действующего actor. */
  seed = (actor: ConversationActor, list: UnreadList) => {
    if (!this.#disposed && this.#sameActor(actor) && !get(this.#state).list)
      this.#state.set({ actor, list, stale: false });
  };
  /** Объединяет чтения в один Promise с таймаутом и защитой эпохи/actor. Актуальный сбой помечает сводку stale; при запрошенном повторе ожидает его результат. */
  refresh = (): Promise<void> => {
    const actor = get(this.#state).actor;
    if (this.#disposed || !actor || !this.dependencies.visible())
      return Promise.resolve();
    if (this.#pending) return this.#pending;
    const version = this.#epoch;
    const request = new AbortController();
    this.#controller = request;
    const timeout = setTimeout(
      () => request.abort(timeoutFailure),
      ownListRequestTimeoutMs,
    );
    const operation = this.dependencies
      .load(actor, request.signal)
      .then((list) => {
        if (
          !this.#disposed &&
          version === this.#epoch &&
          !request.signal.aborted &&
          this.#sameActor(actor)
        ) {
          this.#appliedVersion++;
          this.#state.set({ ...get(this.#state), actor, list, stale: false });
        }
      })
      .catch((error: unknown) => {
        if (
          this.#disposed ||
          version !== this.#epoch ||
          !this.#sameActor(actor) ||
          !this.dependencies.visible() ||
          (request.signal.aborted && request.signal.reason !== timeoutFailure)
        )
          return;
        this.reportUnavailable();
        throw request.signal.reason === timeoutFailure
          ? new TypeError("Unread request timed out")
          : error;
      })
      .then(
        async () => {
          await this.#settle({ request, timeout });
        },
        async (error: unknown) => {
          if (!(await this.#settle({ request, timeout }))) throw error;
        },
      );
    this.#pending = operation;
    return operation;
  };
  /** Освобождает таймер и принадлежащий запросу pending; выполняет накопленный повтор и сообщает, был ли он запущен. */
  readonly #settle = async ({
    request,
    timeout,
  }: Readonly<{
    request: AbortController;
    timeout: ReturnType<typeof setTimeout>;
  }>) => {
    clearTimeout(timeout);
    if (this.#controller !== request) return false;
    this.#controller = null;
    this.#pending = null;
    const again = this.#repeat;
    this.#repeat = false;
    if (again) await this.refresh();
    return again;
  };
  /** Использует существующее coalesced чтение; ACK разрешён лишь после реально установленной сводки этого actor. */
  refreshForDelivery = async ({
    signal,
  }: Readonly<{ signal: AbortSignal }>): Promise<UnreadRefreshOutcome> => {
    const actor = get(this.#state).actor;
    const epoch = this.#epoch;
    const version = this.#appliedVersion;
    const active = () =>
      !this.#disposed &&
      !signal.aborted &&
      epoch === this.#epoch &&
      actor !== null &&
      this.#sameActor(actor) &&
      this.dependencies.visible();
    if (!active()) return { kind: "stale" };
    const abort = () => this.#controller?.abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      await this.invalidate();
      return active() && this.#appliedVersion > version
        ? { kind: "applied" }
        : { kind: "stale" };
    } catch (error) {
      return active() ? classifyUnreadFailure(error) : { kind: "stale" };
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };
  /** Сохраняет публичный код ошибки именно unread-подписки до явного recovery. */
  reportDeliveryIssue = (code: RealtimeErrorCode | undefined) =>
    this.#state.update(({ issue: _issue, ...value }) =>
      code ? { ...value, issue: code } : value,
    );
  /** Запрашивает обновление; событие во время чтения сохраняет один обязательный повтор после завершения. */
  invalidate = () => {
    this.#repeat = Boolean(this.#pending);
    return this.refresh();
  };
  /** После подключения инвалидирует сводку, чтобы восстановить пропущенные изменения. */
  connected = () => this.invalidate();
  /** Запрашивает отмену активного чтения без удаления сохранённой сводки. */
  suspend = () => this.#controller?.abort();
  /** Помечает сводку действующего actor устаревшей, сохраняя последние данные. */
  reportUnavailable = () => {
    if (!this.#disposed && get(this.#state).actor)
      this.#state.update((value) => ({ ...value, stale: true }));
  };
  /** Запрещает новые чтения и очищает приватное состояние с отменой текущего запроса. */
  dispose = () => {
    this.#disposed = true;
    this.clear();
  };
}
/** Создаёт изолированного владельца unread-сводки с собственным readable состоянием и жизненным циклом. */
export const createUnreadSummary = (
  dependencies: UnreadDependencies,
): UnreadSummary => new SummaryOwner(dependencies);
