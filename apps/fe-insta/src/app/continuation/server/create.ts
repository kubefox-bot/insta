import { ContinuationErrorCode } from "@insta/contracts/errors";
import { connectDragonfly } from "@insta/fe-core/dragonfly/server";
import type { RedisClient } from "bun";
import {
  authorizeContinuationRequest,
  continuationGenerationKey,
  createDragonflyIntents,
} from "../../../domains/auth-continuation/server/index";
import {
  loadSession,
  projectRegistration,
  registrationCookieName,
} from "../../../domains/users/server/index";
import {
  readContinuationConfig,
  readRuntimeConfig,
} from "../../../lib/config/server/index";
import { createRequestTargets } from "./targets";

const state: { client?: RedisClient; connecting?: Promise<RedisClient> } = {};
/**
 * Лениво приобретает принадлежащий процессу Dragonfly-клиент, объединяя параллельные попытки;
 * отклонённый Promise освобождается для повтора.
 */
const acquire = async () => {
  if (state.client) return state.client;
  if (!state.connecting) {
    const config = readContinuationConfig();
    state.connecting = connectDragonfly(config)
      .then((client) => {
        state.client = client;
        return client;
      })
      .finally(() => {
        state.connecting = undefined;
      });
  }
  return state.connecting;
};
/**
 * Дожидается текущей попытки Dragonfly и закрывает принадлежащий composition клиент;
 * сбрасывает сохранённую ссылку.
 */
export const closeContinuation = async () => {
  const client =
    state.client ?? (await state.connecting?.catch(() => undefined));
  client?.close();
  state.client = undefined;
};
/**
 * Собирает обработчик continuation с Dragonfly intents, целями и identity текущего запроса;
 * отсутствие generation или ошибка обработки превращается в no-store 409 IntentUnavailable.
 */
export const createContinuationRequest =
  ({
    auth,
    conversations,
  }: Readonly<{
    auth: App.Locals["auth"];
    conversations: Pick<App.Locals["conversations"], "start">;
  }>) =>
  async (input: Parameters<typeof authorizeContinuationRequest>[0]) => {
    try {
      const client = await acquire();
      const generation = await client.get(continuationGenerationKey);
      if (!generation) throw new Error("Continuation generation unavailable");
      const config = readRuntimeConfig();
      return await authorizeContinuationRequest(input, {
        intents: createDragonflyIntents({ client, generation }),
        targets: createRequestTargets({
          auth,
          conversations,
          input,
          available: config.storiesAvailable,
        }),
        key: config.sessionKeys.cookieKey,
        identity: {
          /**
           * Получает текущую web-сессию через заимствованный auth API и cookies запроса, не сохраняя
           * actor между запросами.
           */
          read: () =>
            loadSession({
              auth,
              request: input.request,
              origin: input.origin,
              cookies: input.cookies,
            }),
          /**
           * Проверяет зашифрованный registration cookie текущим временем и возвращает доступный срок
           * регистрации; непроецируемая регистрация не даёт deadline.
           */
          registrationDeadline: async () => {
            const registration = await projectRegistration({
              cookie: input.cookies.get(registrationCookieName),
              key: config.sessionKeys.cookieKey,
              now: Date.now(),
            });
            return "expiresAt" in registration
              ? registration.expiresAt
              : undefined;
          },
        },
      });
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: ContinuationErrorCode.IntentUnavailable,
            message: ContinuationErrorCode.IntentUnavailable,
          },
          meta: {},
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
