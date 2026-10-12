import { Result } from "@bloodyowl/boxed";
import { logFields } from "../contracts/conts";
import { normalizeCorrelation, record } from "../normalize/normalize";

/** Извлекает допустимый request ID из поддержанных полей ошибки; отказ чтения payload оставляет корреляцию пустой. */
export const failureCorrelation = (error: unknown) => {
  const attempted = Result.fromExecution(() => {
    const payload = record(error);
    const correlation = record(payload.correlation);
    const requestId =
      correlation.request_id ?? correlation.requestId ?? payload.request_id;
    return normalizeCorrelation({
      ...(typeof requestId === "string"
        ? { [logFields.requestId]: requestId }
        : {}),
    });
  });
  return attempted.isOk() ? attempted.get() : {};
};
