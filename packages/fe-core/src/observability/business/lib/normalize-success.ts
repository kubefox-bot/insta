import { Result } from "@bloodyowl/boxed";
import { logFields } from "../../contracts/conts";
import type { BusinessObserverOptions } from "../types";
/** Нормализует успешный код через переданный провайдер; при его исключении сохраняет код с retryable=false и известным исходом. */
export const normalizeSuccess = ({
  code,
  normalize,
}: Readonly<{
  code: string;
  normalize: BusinessObserverOptions["normalizeSuccess"];
}>) => {
  const attempted = Result.fromExecution(() => normalize(code));
  return attempted.isOk()
    ? attempted.get()
    : { code, retryable: false, [logFields.resultUnknown]: false };
};
