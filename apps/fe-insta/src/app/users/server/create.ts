import {
  type AuthRequest,
  createAuthBackend,
  createDirectoryBackend,
  createRegistrationBackend,
  createTicketBackend,
  directoryRequest,
  loginRequest,
  registrationRequest,
  sessionRequest,
  ticketRequest,
} from "../../../domains/users/server/index";
import type { RequestContext } from "../../../lib/api/server/index";
import { readRuntimeConfig } from "../../../lib/config/server/index";
import { createSessionRequest } from "./session/create";
/**
 * Собирает серверные операции auth/directory для одного request context; сессии приобретаются
 * при вызове, backend credentials остаются в серверных адаптерах.
 */
export const createAuthRequest = ({
  context,
  source,
}: Readonly<{ context: RequestContext; source: () => Promise<string> }>) => {
  /**
   * Готовит session, auth и registration порты с проверенной конфигурацией и текущим
   * источником; общий session store заимствуется у process owner.
   */
  const dependencies = async () => {
    const config = readRuntimeConfig();
    return {
      sessions: await createSessionRequest({ context, source }),
      context,
      cookieKey: config.sessionKeys.cookieKey,
      backend: createAuthBackend({ config, source, context }),
      registration: createRegistrationBackend({ config, source, context }),
    };
  };
  return {
    /**
     * Передаёт поиск пользователей domain BFF с directory backend и session-зависимостями
     * текущего запроса.
     */
    directory: async (input: AuthRequest) => {
      const owned = await dependencies();
      return directoryRequest(input, {
        ...owned,
        backend: createDirectoryBackend({
          config: readRuntimeConfig(),
          source,
          context,
        }),
      });
    },
    /**
     * Запускает BFF входа с session store и auth backend; cookie и результат входа формирует
     * владелец users.
     */
    login: async (input: AuthRequest) =>
      loginRequest(input, await dependencies()),
    /**
     * Передаёт шаг регистрации users BFF с registration backend и ключом защищённого cookie.
     */
    registration: async (input: AuthRequest) =>
      registrationRequest(input, await dependencies()),
    /**
     * Проецирует web-сессию через users BFF с backend проверки и обновления сессии.
     */
    session: async (input: AuthRequest) =>
      sessionRequest(input, await dependencies()),
    /**
     * Собирает ticket backend и session-зависимости для выдачи websocket ticket через users BFF.
     */
    ticket: async (input: AuthRequest) => {
      const owned = await dependencies();
      return ticketRequest(input, {
        ...owned,
        backend: createTicketBackend({
          config: readRuntimeConfig(),
          source,
          context,
        }),
      });
    },
  };
};
