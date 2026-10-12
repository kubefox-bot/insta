import { logFields } from "../contracts/conts";
import type { Result as BusinessResult } from "../contracts/types";
import { canonicalUuid4 } from "../identifiers/canonical-uuid4";
import type { ObservabilityOperation } from "../types";
import { completeOperation } from "./complete-operation";
import { emitDiagnostic } from "./emit-diagnostic";
import { normalizeSuccess } from "./lib/normalize-success";
import type { BusinessObserverOptions, BusinessOperation } from "./types";

/** Оборачивает portable operation явными бизнес-исходами и диагностикой; локально накапливает attributes для последующих событий и завершения. */
export const createBusinessOperation = (
  name: string,
  portable: ObservabilityOperation,
  options: Pick<BusinessObserverOptions, "normalizeSuccess" | "emit">,
): BusinessOperation & {
  completeClassified(
    outcome: "failed" | "rejected",
    error: unknown,
    result?: BusinessResult,
  ): void;
} => {
  const attributes: Record<string, unknown> = {};
  /** Передаёт исход, ошибку и текущие attributes владельцу завершения, который обнаруживает повторный completion. */
  const complete = (
    outcome: "pending" | "succeeded" | "failed" | "rejected",
    code?: string,
    error?: unknown,
    result?: BusinessResult,
  ): void =>
    completeOperation({
      portable,
      name,
      emit: options.emit,
      attributes,
      outcome,
      code,
      error,
      result,
    });

  return {
    /** Возвращает ID лежащей в основе portable operation без создания нового идентификатора. */
    get id() {
      return portable.id;
    },
    /** Принимает внешний operation ID только как канонический UUID v4. */
    adopt: (value) => {
      const accepted = canonicalUuid4(value);
      if (accepted) portable.adopt({ [logFields.operationId]: accepted });
    },
    /** Передаёт корреляцию portable operation, где применяются её правила нормализации. */
    correlate: (correlation) => portable.adopt(correlation),
    /** Фиксирует pending как явный исход текущего наблюдения. */
    pending: () => complete("pending"),
    /** Нормализует успешный код и завершает наблюдение исходом succeeded. */
    succeeded: (code) => {
      complete(
        "succeeded",
        code,
        undefined,
        normalizeSuccess({ code, normalize: options.normalizeSuccess }),
      );
    },
    /** Завершает наблюдение как failed с исходной ошибкой и необязательным явным result. */
    failed: (error, code, result) => complete("failed", code, error, result),
    /** Завершает наблюдение как rejected с кодом и необязательными ошибкой/result. */
    rejected: (code, error, result) =>
      complete("rejected", code, error, result),
    /** Дополняет локальные attributes переданными полями, не меняя объект вызывающего кода. */
    attributes: (values) => {
      Object.assign(attributes, values);
    },
    /** Отправляет diagnostic event с ID и снимком накопленных attributes, не завершая операцию. */
    event: (event) =>
      emitDiagnostic(options.emit, {
        type: "event",
        operation: name,
        [logFields.operationId]: portable.id,
        event,
        ...(Object.keys(attributes).length > 0
          ? { attributes: { ...attributes } }
          : {}),
      }),
    /** Читает факт завершения из portable operation, не поддерживая вторую копию состояния. */
    isComplete: () => portable.isComplete(),
    /** Применяет уже классифицированный failed/rejected и его result без повторной классификации. */
    completeClassified: (outcome, error, result) =>
      complete(outcome, result?.code, error, result),
  };
};
