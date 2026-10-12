import { Result } from "@bloodyowl/boxed";
import { logFields } from "../contracts/conts";
import { emitDiagnostic } from "./emit-diagnostic";
import { createBusinessOperation } from "./operation";
import type { BusinessObserverOptions, BusinessOperation } from "./types";

/** Запускает наблюдение callback, диагностируя успешный возврат без явного исхода. При ошибке применяет классификацию и корреляцию, завершает операцию и повторно выбрасывает исходную ошибку; сбой классификатора означает failed. */
export const observeOperation = async <T>(
  name: string,
  callback: (operation: BusinessOperation) => Promise<T>,
  options: BusinessObserverOptions,
): Promise<T> => {
  const portable = options.runtime.operation(name);
  const operation = createBusinessOperation(name, portable, options);
  portable.start();
  const invoked = Result.fromExecution(() => callback(operation));
  const promise = invoked.isOk()
    ? invoked.get()
    : Promise.reject(invoked.getError());
  const result = await Result.fromPromise(promise);

  if (result.isOk()) {
    if (!operation.isComplete()) {
      emitDiagnostic(options.emit, {
        type: "violation",
        operation: name,
        [logFields.operationId]: operation.id,
        code: "missing_outcome",
      });
    }
    return result.get();
  }

  const error = result.getError();
  const classification = Result.fromExecution(() =>
    options.classifyFailure(error),
  );
  const classified = classification.isOk()
    ? classification.get()
    : { outcome: "failed" as const };
  const { operation_id: acceptedId, ...correlation } =
    classified.correlation ?? {};
  if (acceptedId) operation.adopt(acceptedId);
  operation.correlate(correlation);
  operation.completeClassified(classified.outcome, error, classified.result);
  throw error;
};
