import { maxReceiptBatchIds } from "@insta/contracts/messages";
import type { Message } from "../../types";
import type {
  ReceiptBatchWireSnapshot,
  ReceiptRequest,
  ReceiptWireState,
} from "../types";
import { receiptRank, receiptSendPriority } from "./conts";
import type { ReceiptEntry } from "./types";

/** Переводит известные даты квитанции в ранг, где чтение сильнее доставки. */
const confirmedRank = (receipt?: ReceiptWireState) => {
  if (receipt?.readAt) return receiptRank.read;
  return receipt?.deliveredAt ? receiptRank.delivered : receiptRank.none;
};
export class ReceiptEntries {
  readonly #entries = new Map<string, ReceiptEntry>();
  #conversationId: string | null = null;
  /** Закрепляет накопитель за получателем, чтобы его собственные исходящие сообщения не подтверждались. */
  constructor(readonly actorId: string) {}
  /** Принимает чужие сообщения только первого закреплённого диалога; подтверждённый ранг повышает монотонно. */
  readonly accept = (messages: readonly Message[]) => {
    for (const message of messages) {
      if (message.authorId === this.actorId) continue;
      this.#conversationId ??= message.conversationId;
      if (message.conversationId !== this.#conversationId) continue;
      const confirmed = confirmedRank(message.receipt);
      const previous = this.#entries.get(message.id);
      if (previous)
        previous.confirmed = Math.max(previous.confirmed, confirmed);
      else
        this.#entries.set(message.id, {
          desired: receiptRank.delivered,
          confirmed,
          stopped: receiptRank.none,
        });
    }
  };
  /** Поднимает желаемый ранг уже известных идентификаторов до чтения; неизвестные идентификаторы пропускает. */
  readonly read = (ids: readonly string[]) => {
    for (const id of ids) {
      const entry = this.#entries.get(id);
      if (entry) entry.desired = receiptRank.read;
    }
  };
  /** Выбирает ограниченный контрактом пакет нужного ранга, исключая уже подтверждённые и остановленные уровни. */
  readonly #idsForStatus = (status: ReceiptRequest["status"]) => {
    const messageIds: string[] = [];
    for (const [id, entry] of this.#entries) {
      if (
        entry.desired !== receiptRank[status] ||
        entry.desired <= Math.max(entry.confirmed, entry.stopped)
      )
        continue;
      messageIds.push(id);
      if (messageIds.length === maxReceiptBatchIds) break;
    }
    return messageIds;
  };
  /** Выбирает следующий пакет с приоритетом чтения над доставкой, не удаляя записи до подтверждения. */
  readonly next = (): ReceiptRequest | null => {
    if (!this.#conversationId) return null;
    for (const status of receiptSendPriority) {
      const messageIds = this.#idsForStatus(status);
      if (messageIds.length)
        return { conversationId: this.#conversationId, status, messageIds };
    }
    return null;
  };
  /** Повышает подтверждённый ранг известных сообщений по серверному снимку без отката старых квитанций. */
  readonly complete = (snapshot: ReceiptBatchWireSnapshot) => {
    for (const receipt of snapshot.receipts) {
      const entry = this.#entries.get(receipt.messageId);
      if (entry)
        entry.confirmed = Math.max(entry.confirmed, confirmedRank(receipt));
    }
  };
  /** Останавливает повтор отклонённого ранга; последующий более высокий ранг остаётся допустимым. */
  readonly stop = (request: ReceiptRequest) => {
    for (const id of request.messageIds) {
      const entry = this.#entries.get(id);
      if (entry)
        entry.stopped = Math.max(entry.stopped, receiptRank[request.status]);
    }
  };
  /** Проверяет подтверждение требуемого ранга для каждого идентификатора; отсутствующая запись считается неподтверждённой. */
  readonly satisfied = (request: ReceiptRequest) =>
    request.messageIds.every(
      (id) =>
        (this.#entries.get(id)?.confirmed ?? receiptRank.none) >=
        receiptRank[request.status],
    );
  /** Удаляет записи и освобождает привязку накопителя к диалогу. */
  readonly clear = () => {
    this.#entries.clear();
    this.#conversationId = null;
  };
}
