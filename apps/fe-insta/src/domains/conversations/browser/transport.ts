import { z } from "zod";
import { webSessionHeaders } from "../../../lib/session/contracts/index";
import { historySchema, listSchema, startSchema } from "../contracts/schema";
import { ConversationRequestError } from "./lib/http/request-error";
import { readRetryAfter } from "./lib/http/retry-after";
import type {
  ConversationActor,
  ConversationHttp,
  HistoryQuery,
} from "./types";

const failureSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string() }),
});
/** Создаёт browser BFF-транспорт, фиксирующий userId и generation на время сессии; все ответы проверяются по wire-схемам. */
export const createConversationTransport = ({
  actor,
  request = fetch,
  now = Date.now,
}: Readonly<{
  actor: ConversationActor;
  request?: ConversationHttp;
  now?: () => number;
}>) => {
  /** Выполняет same-origin запрос без кеша с заголовками actor; неверный контракт и HTTP-ошибка отклоняют Promise. */
  const read = async <T>(
    url: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ) => {
    const response = await request(url, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...init.headers,
        [webSessionHeaders.ownerId]: actor.userId,
        [webSessionHeaders.generation]: actor.generation,
      },
    });
    if (!response.ok) {
      const delay = readRetryAfter({
        header: response.headers.get("Retry-After"),
        now: now(),
      });
      const retryAfterMs =
        delay === undefined
          ? undefined
          : Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(delay));
      const raw: unknown = await response.json().catch(() => null);
      const failure = failureSchema.safeParse(raw, { jitless: true });
      throw new ConversationRequestError(
        response.status,
        retryAfterMs,
        failure.success ? failure.data.error.code : "HTTP_REQUEST_FAILED",
      );
    }
    const raw: unknown = await response.json();
    return z
      .object({ ok: z.literal(true), data: schema })
      .parse(raw, { jitless: true }).data;
  };
  return {
    /** Читает список диалогов; переданный AbortSignal управляет отменой запроса. */
    list: (signal?: AbortSignal) =>
      read("/api/conversations", listSchema, { signal }),
    /** Кодирует ID диалога и параметры страницы истории, затем проверяет ответ BFF. */
    history: ({ conversationId, cursor, after, limit }: HistoryQuery) => {
      const query = new URLSearchParams();
      if (cursor) query.set("cursor", cursor);
      if (limit !== undefined) query.set("limit", String(limit));
      if (after !== undefined) query.set("after", String(after));
      return read(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages?${query}`,
        historySchema,
      );
    },
    /** Создаёт либо получает диалог POST-запросом с ID получателя. */
    start: (recipientId: string) =>
      read("/api/conversations", startSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId }),
      }),
  };
};
