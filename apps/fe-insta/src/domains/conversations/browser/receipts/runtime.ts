import { get, readonly, writable } from "svelte/store";
import type { Message } from "../types";
import { attemptReceipt } from "./attempt";
import { receiptTransportCodes } from "./conts";
import { isReceiptActor } from "./domain/actor";
import { receiptFlushMs, receiptRetryMs } from "./domain/conts";
import { ReceiptEntries } from "./domain/entries";
import type { ReceiptQueueDependencies } from "./ports/types";
import type {
  ReceiptAttempt,
  ReceiptFailure,
  ReceiptQueueError,
  ReceiptQueueView,
  ReceiptRequest,
} from "./types";

export class ReceiptQueueRuntime {
  readonly #entries;
  readonly #errors = new Map<ReceiptRequest, ReceiptQueueError>();
  readonly #view = writable<ReceiptQueueView>({ errors: [] });
  readonly view = readonly(this.#view);
  #disposed = false;
  #cancelTimer: (() => void) | null = null;
  #controller: AbortController | null = null;
  #retryRequest: ReceiptRequest | null = null;
  #attempts = 0;
  #retryAt = 0;
  /** Закрепляет очередь квитанций за пользователем и переданными зависимостями; таймеры запускаются при поступлении работы. */
  constructor(readonly dependencies: ReceiptQueueDependencies) {
    this.#entries = new ReceiptEntries(dependencies.actor.userId);
  }
  /** Разрешает работу только живой очереди с тем же пользователем и поколением авторизации. */
  readonly #active = () => {
    const current = this.dependencies.currentActor();
    const expected = this.dependencies.actor;
    return !this.#disposed && isReceiptActor({ current, expected });
  };
  /** Публикует копии ошибок и списков идентификаторов, не раскрывая изменяемые коллекции runtime. */
  readonly #publish = () =>
    this.#view.set({
      errors: [...this.#errors.values()].map((error) => ({
        ...error,
        messageIds: [...error.messageIds],
      })),
    });
  /** Снимает принадлежащий очереди таймер и освобождает слот планирования. */
  readonly #cancelScheduled = () => {
    this.#cancelTimer?.();
    this.#cancelTimer = null;
  };
  /** Планирует единственный flush при активном владельце; необработанный сбой останавливает очередь и публикует диагностическую проблему. */
  readonly #schedule = (delayMs: number) => {
    if (!this.#active() || this.#controller || this.#cancelTimer) return;
    this.#cancelTimer = this.dependencies.clock.schedule(() => {
      this.#cancelTimer = null;
      this.#flush().catch(() => {
        const current = get(this.#view);
        this.dispose();
        this.#view.set({
          ...current,
          issue: receiptTransportCodes.queueFailed,
        });
      });
    }, delayMs);
  };
  /** Убирает ошибку завершённого запроса, сбрасывает повтор и счётчик попыток, затем обновляет представление. */
  readonly #settled = (request: ReceiptRequest) => {
    this.#errors.delete(request);
    this.#retryRequest = null;
    this.#attempts = 0;
    this.#publish();
  };
  /** Фиксирует ошибку; окончательный отказ блокирует данный ранг, повторяемый сохраняет запрос и учитывает backoff и Retry-After. */
  readonly #reject = ({
    request,
    failure,
  }: Readonly<{ request: ReceiptRequest; failure: ReceiptFailure }>) => {
    this.#errors.set(request, {
      ...request,
      kind: failure.kind,
      code: failure.code,
    });
    this.#publish();
    if (failure.kind === "terminal") {
      this.#entries.stop(request);
      this.#retryRequest = null;
      this.#attempts = 0;
      return;
    }
    this.#retryRequest = request;
    const delays = Object.values(receiptRetryMs);
    const delayMs = Math.max(
      delays[Math.min(this.#attempts, delays.length - 1)] ?? receiptFlushMs,
      failure.retryAfterMs ?? 0,
    );
    this.#attempts++;
    this.#retryAt = this.dependencies.clock.now() + delayMs;
    this.#controller = null;
    this.#schedule(delayMs);
  };
  /** Применяет подтверждённый снимок; при отказе сначала проверяет, не удовлетворён ли запрос уже пришедшими квитанциями. */
  readonly #complete = ({
    request,
    outcome,
  }: Readonly<{ request: ReceiptRequest; outcome: ReceiptAttempt }>) => {
    if (outcome.kind === "confirmed") {
      this.#entries.complete(outcome.snapshot);
      this.#settled(request);
      return;
    }
    if (this.#entries.satisfied(request)) {
      this.#settled(request);
      return;
    }
    this.#reject({ request, failure: outcome });
  };
  /** Выполняет один пакет под собственным AbortController; игнорирует поздний исход чужого поколения и планирует оставшуюся работу после освобождения запроса. */
  readonly #flush = async () => {
    if (!this.#active() || this.#controller) return;
    const request = this.#retryRequest ?? this.#entries.next();
    if (!request) return;
    const owned = new AbortController();
    this.#controller = owned;
    try {
      const outcome = await attemptReceipt({
        request,
        signal: owned.signal,
        dependencies: this.dependencies,
      });
      if (!this.#active() || owned.signal.aborted) return;
      this.#complete({ request, outcome });
    } finally {
      if (this.#controller === owned) this.#controller = null;
      if (this.#active() && !this.#retryRequest && this.#entries.next())
        this.#schedule(0);
    }
  };
  /** Добавляет входящие сообщения и снимает уже удовлетворённый повтор; планирует пакетную отправку оставшихся квитанций. */
  readonly acceptMessages = (messages: readonly Message[]) => {
    if (!this.#active()) return;
    this.#entries.accept(messages);
    if (this.#retryRequest && this.#entries.satisfied(this.#retryRequest)) {
      this.#settled(this.#retryRequest);
      this.#cancelScheduled();
    }
    if (this.#entries.next()) this.#schedule(receiptFlushMs);
  };
  /** Поднимает желаемый ранг известных видимых сообщений до прочтения и планирует отправку для активного владельца. */
  readonly readVisible = (ids: readonly string[]) => {
    if (!this.#active()) return;
    this.#entries.read(ids);
    if (this.#entries.next()) this.#schedule(receiptFlushMs);
  };
  /** Перепланирует сохранённый повтор с учётом минимальной задержки и ранее назначенного срока; параллельную попытку не запускает. */
  readonly retry = () => {
    if (!this.#active() || !this.#retryRequest || this.#controller) return;
    this.#cancelScheduled();
    this.#schedule(
      Math.max(receiptFlushMs, this.#retryAt - this.dependencies.clock.now()),
    );
  };
  /** Отзывает очередь, отменяет таймер и запрос, очищает приватные записи и ошибки; abort не доказывает отмену серверного эффекта. */
  readonly dispose = () => {
    this.#disposed = true;
    this.#cancelScheduled();
    this.#controller?.abort();
    this.#controller = null;
    this.#retryRequest = null;
    this.#entries.clear();
    this.#errors.clear();
    this.#view.set({ errors: [] });
  };
}
