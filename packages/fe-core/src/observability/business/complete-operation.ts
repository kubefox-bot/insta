import { Result } from "@bloodyowl/boxed";
import { logFields } from "../contracts/conts";
import type { Result as BusinessResult } from "../contracts/types";
import type { ObservabilityOperation } from "../types";
import { emitDiagnostic } from "./emit-diagnostic";
import { failureCorrelation } from "./failure-correlation";
import { readFailureResult } from "./lib/failure-result";
import type { BusinessObserverOptions } from "./types";

type Completion = Readonly<{
  portable: ObservabilityOperation;
  name: string;
  emit: BusinessObserverOptions["emit"];
  attributes: Record<string, unknown>;
  outcome: "pending" | "succeeded" | "failed" | "rejected";
  code?: string;
  error?: unknown;
  result?: BusinessResult;
}>;

/** Пробует извлечь бизнес-result из ошибки; отказ чтения необязательных данных возвращает undefined. */
const deriveFailureResult = (
  error: unknown,
  code: string | undefined,
  outcome: Completion["outcome"],
): BusinessResult | undefined => {
  const attempted = Result.fromExecution(() =>
    readFailureResult({ error, ...(code ? { code } : {}), outcome }),
  );
  return attempted.isOk() ? attempted.get() : undefined;
};

/** Завершает portable operation один раз, добавляя request correlation и result; повторный вызов диагностирует как multi_completion, failed с ошибкой дополнительно сообщает diagnostic error. */
export const completeOperation = ({
  portable,
  name,
  emit,
  attributes,
  outcome,
  code,
  error,
  result,
}: Completion): void => {
  if (portable.isComplete()) {
    emitDiagnostic(emit, {
      type: "violation",
      operation: name,
      [logFields.operationId]: portable.id,
      code: "multi_completion",
    });
    return;
  }

  const correlation = failureCorrelation(error);
  portable.adopt(correlation);
  const finalResult =
    result ??
    (outcome === "succeeded" || outcome === "pending"
      ? undefined
      : deriveFailureResult(error, code, outcome));
  if (outcome === "failed" && error !== undefined) {
    emitDiagnostic(emit, {
      type: "error",
      operation: name,
      [logFields.operationId]: portable.id,
      ...correlation,
      attributes: { ...attributes },
      error,
      ...(finalResult?.code ? { code: finalResult.code } : {}),
    });
  }
  portable.complete(outcome, finalResult, attributes);
};
