import type {
  DeliveryAck,
  DeliveryNotice,
  PreparedSubscription,
} from "@insta/contracts/realtime";
import { DeliveryCursorStore } from "../delivery/state";
import { SubscriptionCommands, samePosition } from "./commands";
import type { SubscriptionDependencies } from "./types";
/** Сериализует target-only команды и отделяет transport token от сохранённой проекции. */
export class SubscriptionLifecycle {
  readonly cursor = new DeliveryCursorStore();
  readonly #commands: SubscriptionCommands;
  #prepared: PreparedSubscription | null = null;
  #generation = 0;
  #ready = false;
  #projectionValid = false;
  #tail: Promise<unknown> = Promise.resolve();
  #needsClose = false;
  /** Владеет одной target identity; command adapter заимствует транспорт. */
  constructor(private readonly dependencies: SubscriptionDependencies) {
    this.#commands = new SubscriptionCommands(dependencies);
  }
  /** Захватывает lifetime: поздняя команда не получает нового владельца. */
  readonly guard = () => {
    const generation = this.#generation;
    return () => generation === this.#generation && this.dependencies.current();
  };
  /** Проверяет точную identity входящего callback. */
  readonly owns = (position: DeliveryAck | DeliveryNotice) =>
    this.dependencies.current() && this.cursor.owns(position);
  /** Business apply разрешён только после exact activate. */
  readonly ready = () => this.#ready;
  /** Сохраняет cursor только проекции, которая завершила bootstrap. */
  readonly lost = () => {
    this.#generation++;
    this.#prepared = null;
    this.#ready = false;
    this.#needsClose = false;
    if (this.#projectionValid) this.cursor.lost();
    else this.cursor.clear();
  };
  /** Следующая команда ждёт actual settlement предыдущей, в том числе неизвестного ACK. */
  readonly #run = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = this.#tail.then(operation, operation);
    this.#tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };
  /** Получает baseline до snapshot и сохраняет повторный paused prepare того же lifetime. */
  readonly prepare = () =>
    this.#run(async () => {
      const active = this.guard();
      if (!active()) throw new Error("Stale subscription");
      this.#ready = false;
      if (this.#needsClose) await this.#unsubscribe(active);
      if (this.#prepared) return this.#prepared;
      const resume = this.cursor.position();
      const prepared = await this.#commands.prepare(resume);
      if (!active()) throw new Error("Stale subscription");
      if (!samePosition(prepared.baseline, resume))
        this.#projectionValid = false;
      this.#prepared = prepared;
      this.cursor.bind(prepared);
      return prepared;
    });
  /** Доставка стартует только после установки canonical snapshot владельцем проекции. */
  readonly activate = () =>
    this.#run(async () => {
      const active = this.guard();
      const prepared = this.#prepared;
      if (!prepared || !active()) throw new Error("Stale subscription");
      await this.#commands.activate(prepared);
      if (!active() || this.#prepared !== prepared)
        throw new Error("Stale activation");
      this.#ready = true;
      this.#projectionValid = true;
    });
  /** Сразу запрещает apply; неизвестный close ACK оставляет barrier до следующего prepare. */
  readonly close = () => {
    this.#generation++;
    this.#ready = false;
    this.#projectionValid = false;
    this.cursor.clear();
    this.#prepared = null;
    this.#needsClose = true;
    const active = this.guard();
    return this.#run(() => this.#unsubscribe(active));
  };
  /** Освобождает server slot; stale generation не отправляет target-only unsubscribe. */
  readonly #unsubscribe = async (active: () => boolean) => {
    if (!active() || !this.#needsClose) return;
    await this.#commands.unsubscribe();
    if (active()) this.#needsClose = false;
  };
}
