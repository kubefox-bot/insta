import type { RequestContext } from "../../../../lib/api/server/index";
import { readRuntimeConfig } from "../../../../lib/config/server/index";
import {
  createBackendAuth,
  createMongoSessionStore,
  createSessionCrypto,
  ensureSessionIndexes,
  startRevocationWorker,
} from "../../../../lib/session/server/index";
import { acquireDatabase } from "../../../infrastructure/server/database/index";
import { sessionShutdownMessage, sessionStartupRetryMs } from "./conts";

const state: {
  ready?: Promise<ReturnType<typeof createMongoSessionStore>>;
  stop?: () => Promise<void>;
  startupTimer?: ReturnType<typeof setTimeout>;
  stopping?: boolean;
} = {};
/**
 * Запрещает новое приобретение session-ресурсов после начала остановки процесса, включая
 * завершение уже начатой инициализации.
 */
const requireOpenOwner = () => {
  if (state.stopping) throw new Error(sessionShutdownMessage);
};
/**
 * Один раз готовит индексы и store на общей Mongo БД, затем запускает принадлежащий session
 * owner revocation worker; сбой снимает кеш Promise для повтора.
 */
const acquireStore = (config: ReturnType<typeof readRuntimeConfig>) => {
  requireOpenOwner();
  state.ready ??= acquireDatabase(config)
    .then(async ({ webDb }) => {
      requireOpenOwner();
      await ensureSessionIndexes(webDb);
      requireOpenOwner();
      const store = createMongoSessionStore(webDb);
      state.stop = startRevocationWorker({
        dependencies: {
          store,
          crypto: createSessionCrypto(config.sessionKeys),
          backend: createBackendAuth({
            config,
            context: {},
            /**
             * Помечает серверный retry отзыва сессий локальным источником, поскольку у фоновой работы нет
             * браузерного запроса.
             */
            source: async () => "127.0.0.1",
          }),
          clock: Date.now,
        },
        /**
         * Сообщает о недоступности фонового отзыва в stderr без раскрытия session credentials.
         */
        onError: () => {
          process.stderr.write("Session revocation retry unavailable\n");
        },
      });
      return store;
    })
    .catch((error: unknown) => {
      state.ready = undefined;
      throw error;
    });
  return state.ready;
};
/**
 * Собирает request-scoped session порты поверх общей store: криптографию, backend с
 * корреляцией и источником, часы и ожидание; Mongo клиент остаётся у infrastructure.
 */
export const createSessionRequest = async ({
  context,
  source,
}: Readonly<{ context: RequestContext; source: () => Promise<string> }>) => {
  const config = readRuntimeConfig();
  const store = await acquireStore(config);
  requireOpenOwner();
  return {
    store,
    crypto: createSessionCrypto(config.sessionKeys),
    backend: createBackendAuth({ config, context, source }),
    clock: Date.now,
    /**
     * Создаёт независимый идентификатор web-session операции средствами runtime crypto.
     */
    id: () => crypto.randomUUID(),
    wait: Bun.sleep,
  };
};
/**
 * Закрывает приём новых session-зависимостей, отменяет startup retry и ждёт инициализацию и
 * фактическую остановку revocation worker; общую Mongo БД здесь не закрывает.
 */
export const closeSessions = async () => {
  state.stopping = true;
  clearTimeout(state.startupTimer);
  await state.ready?.catch(() => undefined);
  await state.stop?.();
};
/**
 * Прогревает session store и worker; при недоступности планирует один следующий unref retry,
 * а после начала shutdown больше не запускает работу.
 */
export const initializeSessions = async (): Promise<void> => {
  if (state.stopping) return;
  try {
    await acquireStore(readRuntimeConfig());
  } catch {
    if (state.stopping) return;
    process.stderr.write("Session startup unavailable; retry scheduled\n");
    state.startupTimer = setTimeout(() => {
      initializeSessions().catch(() => {
        process.stderr.write("Session startup failed\n");
      });
    }, sessionStartupRetryMs);
    state.startupTimer.unref();
  }
};
