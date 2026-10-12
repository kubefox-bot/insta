import type { CachedHistory, Message } from "../types";
import { earlyReceiptPolicy } from "./conts";
import { mergeReceiptState } from "./merge";
import type {
  ReceiptBatchWireSnapshot,
  ReceiptSnapshotEntry,
  ReceiptSnapshotOutcome,
} from "./types";

export class ReceiptSnapshots {
  readonly #retained = new Map<string, Map<string, ReceiptSnapshotEntry>>();
  readonly #pending = new Map<string, Map<string, ReceiptSnapshotEntry>>();
  /** Удаляет приватные снимки истории и ранние квитанции прежнего actor. */
  readonly clear = () => {
    this.#retained.clear();
    this.#pending.clear();
  };
  /** Удаляет снимки вытесненных диалогов и сообщений после фактической обрезки истории; входной кеш не изменяет. */
  readonly retain = ({
    histories,
  }: Readonly<{
    histories: ReadonlyMap<string, CachedHistory>;
  }>): void => {
    for (const [conversationId, snapshots] of this.#retained) {
      const history = histories.get(conversationId);
      if (!history) {
        this.#retained.delete(conversationId);
        continue;
      }
      const messageIds = new Set(history.items.map(({ id }) => id));
      for (const messageId of snapshots.keys())
        if (!messageIds.has(messageId)) snapshots.delete(messageId);
      if (snapshots.size === 0) this.#retained.delete(conversationId);
    }
  };
  /** Готовит изменения только затронутых сообщений и число ранних квитанций; конфликт идентичности отклоняет пакет до любых записей. */
  readonly #stageBatch = ({
    conversationId,
    receipts,
  }: ReceiptBatchWireSnapshot) => {
    const retained = this.#retained.get(conversationId);
    const pending = this.#pending.get(conversationId);
    const staged = new Map<string, ReceiptSnapshotEntry>();
    let pendingCount = pending?.size ?? 0;
    for (const snapshot of receipts) {
      const previous =
        staged.get(snapshot.messageId) ??
        retained?.get(snapshot.messageId) ??
        pending?.get(snapshot.messageId);
      if (
        previous &&
        (previous.sequence !== snapshot.sequence ||
          (previous.recipientId !== undefined &&
            previous.recipientId !== snapshot.recipientId))
      )
        throw new Error("Conflicting receipt identity");
      if (!previous) pendingCount++;
      staged.set(snapshot.messageId, {
        sequence: snapshot.sequence,
        recipientId: snapshot.recipientId,
        receipt: mergeReceiptState({
          current: previous?.receipt,
          incoming: snapshot,
        }),
      });
    }
    return { staged, pendingCount };
  };
  /** Принимает проверенный пакет атомарно; переполнение раннего буфера требует resync без частичного принятия или вытеснения прежних квитанций. */
  readonly receive = (
    batch: ReceiptBatchWireSnapshot,
  ): ReceiptSnapshotOutcome => {
    const { conversationId } = batch;
    const { staged, pendingCount } = this.#stageBatch(batch);
    const retained = this.#retained.get(conversationId);
    const pending = this.#pending.get(conversationId);
    if (
      pendingCount > earlyReceiptPolicy.maxMessages ||
      (pendingCount > 0 &&
        !pending &&
        this.#pending.size >= earlyReceiptPolicy.maxConversations)
    )
      return { kind: "resync-required", conversationId };
    const nextPending = pending ?? new Map<string, ReceiptSnapshotEntry>();
    for (const [messageId, snapshot] of staged) {
      if (retained?.has(messageId)) retained.set(messageId, snapshot);
      else nextPending.set(messageId, snapshot);
    }
    if (nextPending.size > 0) this.#pending.set(conversationId, nextPending);
    return { kind: "applied" };
  };
  /** Проецирует отметки без мутации сообщений и атомарно переводит совпавшие ранние квитанции в снимки истории. Конфликт sequence сохраняет оба прежних состояния. */
  readonly project = (
    conversationId: string,
    messages: readonly Message[],
  ): readonly Message[] => {
    const retained = this.#retained.get(conversationId);
    const pending = this.#pending.get(conversationId);
    const staged = new Map<string, ReceiptSnapshotEntry>();
    const projected = messages.map((message) => {
      const previous =
        staged.get(message.id) ??
        retained?.get(message.id) ??
        pending?.get(message.id);
      if (previous && previous.sequence !== message.sequence)
        throw new Error("Conflicting receipt sequence");
      const receipt = mergeReceiptState({
        current: previous?.receipt,
        incoming: message.receipt,
      });
      staged.set(message.id, {
        sequence: message.sequence,
        recipientId: previous?.recipientId,
        receipt,
      });
      return receipt ? { ...message, receipt: { ...receipt } } : message;
    });
    const nextRetained = retained ?? new Map<string, ReceiptSnapshotEntry>();
    for (const [messageId, snapshot] of staged) {
      nextRetained.set(messageId, snapshot);
      pending?.delete(messageId);
    }
    if (nextRetained.size > 0) this.#retained.set(conversationId, nextRetained);
    if (pending?.size === 0) this.#pending.delete(conversationId);
    return projected;
  };
}
