import { httpHeaders } from "./conts";
import { correlationSchema } from "./correlation.dto";
/** Валидирует correlation headers: непригодный request ID заменяет новым UUID, необязательный невалидный operation ID исключает. */
export const readCorrelation = (headers: Readonly<Record<string, unknown>>) => {
  const request = correlationSchema.shape.requestId.safeParse(
    headers[httpHeaders.requestId],
  );
  const operation = correlationSchema.shape.operationId.safeParse(
    headers[httpHeaders.operationId],
  );
  return {
    requestId: request.success ? request.data : crypto.randomUUID(),
    ...(operation.success && operation.data
      ? { operationId: operation.data }
      : {}),
  };
};
