import type { Result } from "@bloodyowl/boxed";
import type { RequestContext } from "../../../../lib/api/server/index";
import type { StoryBackendFailure } from "../ports/types";
/** Возвращает успешный Response как есть; ошибку оформляет без кеширования, сохраняя статус, Retry-After и идентификаторы контекста. */
export const storyReply = (
  result: Result<Response, StoryBackendFailure>,
  context: RequestContext,
) => {
  if (result.isOk()) return result.get();
  const error = result.getError();
  return Response.json(
    {
      ok: false,
      error: { code: error.code, message: error.code },
      meta: {
        requestId: error.meta?.requestId ?? context.requestId,
        operationId: error.meta?.operationId ?? context.operationId,
      },
    },
    {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
        ...(error.retryAfter ? { "Retry-After": error.retryAfter } : {}),
      },
    },
  );
};
