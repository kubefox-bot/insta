import {
  createSupportAuthorization,
  createSupportBackend,
  issueSupportRequest,
  type SupportServerDependencies,
  submitSupportRequest,
} from "../../../domains/support-reports/server/index";
import { loadSession } from "../../../domains/users/server/index";
import type { RequestContext } from "../../../lib/api/server/index";
import { readRuntimeConfig } from "../../../lib/config/server/index";
import { createSessionRequest } from "../../users/server/session/index";
/**
 * Связывает support BFF с REST backend, текущей identity и session authorization; переданный
 * auth API заимствуется и не закрывается.
 */
export const createSupportRequest = ({
  context,
  source,
  auth,
}: Readonly<{
  context: RequestContext;
  source: () => Promise<string>;
  auth: App.Locals["auth"];
}>) => {
  /**
   * Готовит support порты для текущего запроса с cookie key, часами и генератором
   * идентификаторов; backend авторизация остаётся у support owner.
   */
  const dependencies = (): SupportServerDependencies => {
    const config = readRuntimeConfig();
    return {
      backend: createSupportBackend({ config, context, source }),
      key: config.sessionKeys.cookieKey,
      context,
      clock: Date.now,
      /**
       * Создаёт независимый идентификатор support операции средствами runtime crypto.
       */
      uuid: () => crypto.randomUUID(),
      /**
       * Проецирует web-сессию в support identity, сохраняя различие между гостем и недоступной
       * проверкой сессии.
       */
      identity: async (input) => {
        const session = await loadSession({ ...input, auth });
        return {
          userId: session.actor?.userId ?? null,
          unavailable: session.status === "unavailable",
        };
      },
      authorized: createSupportAuthorization({
        /**
         * Лениво приобретает session-зависимости для support authorization с текущей корреляцией и
         * источником.
         */
        sessions: () => createSessionRequest({ context, source }),
        key: config.sessionKeys.cookieKey,
        context,
      }),
    };
  };
  return {
    /**
     * Передаёт выдачу support context владельцу сценария с собранными request-зависимостями.
     */
    context: (input: Parameters<typeof issueSupportRequest>[0]) =>
      issueSupportRequest(input, dependencies()),
    /**
     * Передаёт подтверждённую отправку support report владельцу сценария с backend и identity
     * портами.
     */
    submit: (input: Parameters<typeof submitSupportRequest>[0]) =>
      submitSupportRequest(input, dependencies()),
  };
};
