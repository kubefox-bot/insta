import { CommonErrorCode, MessageErrorCode } from "@insta/contracts/errors";
import { httpHeaderNames } from "@insta/contracts/http";
import { messageInputSchema, wireIdSchema } from "@insta/contracts/messages";
import { z } from "zod";
import { acceptsCookieMutation } from "../../../lib/http/server/index";
import { webSessionHeaders } from "../../../lib/session/contracts/index";
import { conversationIdSchema } from "../contracts/schema";
import {
  maximumErrorStatus,
  maximumIdempotencyKeyLength,
  minimumErrorStatus,
  sendStatus,
  upstreamUnavailableStatus,
} from "./conts";
import { authorizeConversation } from "./lib/authorized";
import type { SendDependencies, SendRequest } from "./types";

const headersSchema = z.object({
  ownerId: wireIdSchema,
  conversationId: conversationIdSchema,
  key: z
    .string()
    .max(maximumIdempotencyKeyLength)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});
const backendErrorSchema = z.object({
  code: z.string(),
  status: z.number().int().min(minimumErrorStatus).max(maximumErrorStatus),
  retryAfter: z.string().optional(),
});
/** Проверяет origin, владельца и текст сообщения, затем отправляет его через привязанную сессию без автоматического повтора мутации. Возвращает no-store ответ, сохраняя код ошибки и Retry-After. */
export const sendRequest = async (
  { request, origin, cookies, conversationId }: SendRequest,
  dependencies: SendDependencies,
) => {
  const context = dependencies.context;
  /** Формирует ошибку отправки с контекстом запроса и запретом кеширования; передаёт срок повтора, если он получен. */
  const failure = (code: string, status: number, retryAfter?: string) =>
    Response.json(
      { ok: false, error: { code, message: code }, meta: context },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(retryAfter ? { "Retry-After": retryAfter } : {}),
        },
      },
    );
  if (!acceptsCookieMutation({ request, origin }))
    return failure(CommonErrorCode.Forbidden, sendStatus.FORBIDDEN);
  const header = headersSchema.safeParse({
    ownerId: request.headers.get(webSessionHeaders.ownerId),
    conversationId,
    key: request.headers.get(httpHeaderNames.idempotencyKey) ?? undefined,
  });
  const payload = await request.json().then(
    (value) => messageInputSchema.safeParse(value),
    () => null,
  );
  if (!header.success || !payload?.success)
    return failure(MessageErrorCode.InvalidMessage, sendStatus.INVALID_MESSAGE);
  const result = await authorizeConversation(
    {
      request,
      cookies,
      origin,
      /** Передаёт проверенный текст и ключ идемпотентности backend с токеном, выбранным владельцем сессии. */
      execute: (accessToken) =>
        dependencies.backend({
          accessToken,
          conversationId,
          payload: payload.data,
          key: header.data.key,
        }),
    },
    dependencies,
  );
  if (result.isOk())
    return Response.json(
      { ok: true, data: result.get(), meta: context },
      { headers: { "Cache-Control": "no-store" } },
    );
  const error = result.getError();
  const parsed = backendErrorSchema.safeParse(error);
  return parsed.success
    ? failure(parsed.data.code, parsed.data.status, parsed.data.retryAfter)
    : failure(error.code, upstreamUnavailableStatus);
};
