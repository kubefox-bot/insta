import { requestLimits } from "@insta/contracts/http";
import { requestStreamCancellation } from "../../../streams/server/index";

/**
 * Считает байты JSON в клоне запроса, сохраняя оригинал для route handler. При превышении
 * просит отменить обе ветви потока; reader lock освобождает в finally, ошибки чтения
 * передаёт вызывающему коду.
 */
export const inspectJsonBodyLimit = async (
  request: Request,
): Promise<"json" | null> => {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json" || !request.body) return null;
  const reader = request.clone().body?.getReader();
  if (!reader) return null;
  let receivedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return null;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > requestLimits.jsonBytes) {
        requestStreamCancellation(reader);
        requestStreamCancellation(request.body);
        return "json";
      }
    }
  } finally {
    reader.releaseLock();
  }
};
