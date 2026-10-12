import { Result } from "@bloodyowl/boxed";
import {
  CommonErrorCode,
  ConversationErrorCode,
} from "@insta/contracts/errors";
import type { Cookies } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestContext } from "../../../lib/api/server/index";
import type { SessionDependencies } from "../../../lib/session/server/index";
import { conversationIdSchema } from "../contracts/schema";
import { maximumCursorLength, maximumHistoryLimit } from "./conts";
import { authorizeConversation } from "./lib/authorized";
import { conversationReply } from "./lib/reply";
import type { ConversationReads } from "./ports/reads";

const recipientIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
const querySchema = z
  .strictObject({
    limit: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .transform(Number)
      .refine((value) => value <= maximumHistoryLimit)
      .optional(),
    cursor: z.string().max(maximumCursorLength).optional(),
    after: z
      .string()
      .regex(/^(0|[1-9][0-9]*)$/)
      .transform(Number)
      .refine(Number.isSafeInteger)
      .optional(),
  })
  .refine(({ cursor, after }) => !(cursor && after !== undefined));
export type ConversationReadRequest = Readonly<{
  request: Request;
  cookies: Pick<Cookies, "get">;
  origin: string;
  owner?: Readonly<{ userId: string; generation: string }>;
}>;
export type ConversationReadDependencies = Readonly<{
  sessions: SessionDependencies;
  cookieKey: Uint8Array;
  backend: ConversationReads;
  context: RequestContext;
}>;
/** Читает список от имени привязанного пользователя и переводит результат авторизации/backend в no-store BFF-ответ. */
export const listRequest = async (
  input: ConversationReadRequest,
  dependencies: ConversationReadDependencies,
) =>
  conversationReply(
    await authorizeConversation(
      { ...input, execute: dependencies.backend.list },
      dependencies,
    ),
    dependencies.context,
  );
/** Проверяет ID и параметры страницы, исключая одновременные cursor и after; ошибочный запрос отклоняет до обращения к сессии. */
export const historyRequest = async (
  input: ConversationReadRequest & Readonly<{ conversationId: string }>,
  dependencies: ConversationReadDependencies,
) => {
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(input.request.url).searchParams),
  );
  const id = conversationIdSchema.safeParse(input.conversationId);
  if (!query.success || !id.success)
    return conversationReply(
      Result.Error({ code: CommonErrorCode.InvalidCursor, status: 400 }),
      dependencies.context,
    );
  return conversationReply(
    await authorizeConversation(
      {
        ...input,
        /** Запрашивает проверенную страницу истории с токеном текущего владельца. */
        execute: (accessToken) =>
          dependencies.backend.history({
            accessToken,
            conversationId: id.data,
            ...query.data,
          }),
      },
      dependencies,
    ),
    dependencies.context,
  );
};
/** Проверяет получателя из JSON и создаёт либо получает диалог через авторизованный backend; мутация не повторяется автоматически. */
export const startRequest = async (
  input: ConversationReadRequest,
  dependencies: ConversationReadDependencies,
) => {
  const payload = await input.request.json().then(
    (raw: unknown) =>
      z.strictObject({ recipientId: recipientIdSchema }).safeParse(raw),
    () => null,
  );
  if (!payload?.success)
    return conversationReply(
      Result.Error({
        code: ConversationErrorCode.RecipientNotFound,
        status: 400,
      }),
      dependencies.context,
    );
  return conversationReply(
    await authorizeConversation(
      {
        ...input,
        /** Передаёт проверенный ID получателя backend с токеном привязанной сессии. */
        execute: (accessToken) =>
          dependencies.backend.start({
            accessToken,
            recipientId: payload.data.recipientId,
          }),
      },
      dependencies,
    ),
    dependencies.context,
  );
};
