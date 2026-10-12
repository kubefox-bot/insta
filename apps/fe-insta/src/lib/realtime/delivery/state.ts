import type {
  DeliveryAck,
  DeliveryNotice,
  DeliveryPosition,
  PreparedSubscription,
} from "@insta/contracts/realtime";
/** Хранит только позицию одной живой проекции; transport token меняется независимо от логического cursor. */
export class DeliveryCursorStore {
  #position: DeliveryPosition | null = null;
  #prepared: PreparedSubscription | null = null;
  #generation = 0;
  #tail: Promise<unknown> = Promise.resolve();
  /** Возвращает сохранённый cursor для resume при сохранённой проекции. */
  readonly position = () => this.#position;
  /** Привязывает новый token к подтверждённой позиции bootstrap либо resume. */
  readonly bind = (prepared: PreparedSubscription) => {
    this.#generation++;
    this.#prepared = prepared;
    this.#position = prepared.baseline;
  };
  /** Снимает только transport identity; projection cursor сохраняется для reconnect. */
  readonly lost = () => {
    this.#generation++;
    this.#prepared = null;
  };
  /** Удаляет cursor при утрате проекции, вытеснении или смене actor. */
  readonly clear = () => {
    this.lost();
    this.#position = null;
  };
  /** Проверяет точную identity действующей подписки, не business eventId. */
  readonly owns = (position: DeliveryAck | DeliveryNotice) => {
    const prepared = this.#prepared;
    return (
      prepared !== null &&
      position.subscriptionId === prepared.subscriptionId &&
      position.streamId === prepared.baseline.streamId &&
      position.epoch === prepared.baseline.epoch
    );
  };
  /** Фиксирует generation до async применения, чтобы старый результат не продвинул новый owner. */
  readonly guard = () => {
    const generation = this.#generation;
    return () => generation === this.#generation && this.#prepared !== null;
  };
  /** Продвигает только cursor той же проекции, не заменяя transport identity. */
  readonly commit = (position: DeliveryAck) => {
    this.#position = {
      streamId: position.streamId,
      epoch: position.epoch,
      cursor: position.cursor,
    };
  };
  /** Сериализует применение одной подписки; отказ не блокирует последующий retry. */
  readonly ordered = <T>(apply: () => Promise<T>): Promise<T> => {
    const operation = this.#tail.then(apply, apply);
    this.#tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
}
