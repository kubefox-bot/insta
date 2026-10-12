import { Result } from "@bloodyowl/boxed";
import { outboxOwnerIndex } from "../../../domain/conts";
import type { Queue } from "../../../ports/queue";
import { persistedRecordSchema } from "./record";
import type { TransactionRunner } from "./types";
/** Создаёт чтение очереди владельца с валидацией persisted-данных и устойчивой сортировкой по времени и operationId; повреждение возвращает ошибку. */
export const createList =
  (run: TransactionRunner): Queue["list"] =>
  (ownerId) =>
    run("readonly", (store, complete) => {
      const request = store.index(outboxOwnerIndex).getAll(ownerId);
      request.onsuccess = () => {
        const parsed = persistedRecordSchema
          .array()
          .safeParse(request.result, { jitless: true });
        complete(
          parsed.success
            ? Result.Ok(
                parsed.data.sort(
                  (a, b) =>
                    a.createdAt - b.createdAt ||
                    a.operationId.localeCompare(b.operationId),
                ),
              )
            : Result.Error("PERSISTENCE_FAILED"),
        );
      };
    });
