import { Result } from "@bloodyowl/boxed";
import type { QueuedMessage, QueueError } from "../../../domain/types";
import type { Queue } from "../../../ports/queue";
import { persistedRecordSchema } from "./record";
import type { TransactionRunner } from "./types";
import { writeRequest } from "./write";

/** Проверяет ожидаемую ревизию и владельца, сохраняет неизменяемую идентичность и текст записи; новая ревизия должна увеличиться ровно на один. */
const replacement = ({
  raw,
  record,
  expectedRevision,
}: Readonly<{
  raw: unknown;
  record: QueuedMessage;
  expectedRevision: number;
}>): Result<QueuedMessage | null, QueueError> => {
  if (raw === undefined) return Result.Ok(null);
  const parsed = persistedRecordSchema.safeParse(raw, { jitless: true });
  if (!parsed.success) return Result.Error("PERSISTENCE_FAILED");
  const current = parsed.data;
  if (
    current.ownerId !== record.ownerId ||
    current.revision !== expectedRevision
  )
    return Result.Ok(null);
  const next = {
    ...record,
    key: current.key,
    clientMessageId: current.clientMessageId,
    operationId: current.operationId,
    ownerId: current.ownerId,
    conversationId: current.conversationId,
    text: current.text,
    createdAt: current.createdAt,
  };
  const valid = persistedRecordSchema.safeParse(next, { jitless: true });
  if (!valid.success || next.revision !== current.revision + 1)
    return Result.Error("PERSISTENCE_FAILED");
  return Result.Ok(valid.data);
};
/** Создаёт атомарное ревизионное обновление; конфликт или отсутствие даёт false, отмена передаётся исполнителю транзакции. */
export const createUpdate =
  (run: TransactionRunner): Queue["update"] =>
  (record, expectedRevision, options) =>
    run(
      "readwrite",
      (store, complete) => {
        const request = store.get(record.operationId);
        request.onsuccess = () => {
          const next = replacement({
            raw: request.result,
            record,
            expectedRevision,
          });
          if (next.isError()) {
            complete(Result.Error(next.getError()));
            return;
          }
          const value = next.get();
          if (!value) {
            complete(Result.Ok(false));
            return;
          }
          writeRequest({
            transaction: store.transaction,
            complete,
            /** Сохраняет проверенную замену и отмечает успех запроса до окончательного завершения транзакции. */
            execute: () => {
              const saved = store.put(value);
              saved.onsuccess = () => complete(Result.Ok(true));
            },
          });
        };
      },
      options,
    );
