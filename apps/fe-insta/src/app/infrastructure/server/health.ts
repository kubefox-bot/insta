import { getHealthReady } from "../../../lib/api/generated/clients/getHealthReady";
import { getHealthReady200Schema } from "../../../lib/api/generated/schemas/getHealthReadySchema";
import {
  createApiService,
  createTransport,
  type RequestContext,
} from "../../../lib/api/server/index";
import { readRuntimeConfig } from "../../../lib/config/server/index";
import { acquireDatabase } from "./database/create";

/**
 * Проверяет готовность BFF пингом общей Mongo БД и валидированным REST health backend; любая
 * недоступность даёт false, заимствованная БД остаётся открытой.
 */
export const checkReadiness = async ({
  context = {},
}: Readonly<{ context?: RequestContext }> = {}) => {
  try {
    const config = readRuntimeConfig();
    const database = await acquireDatabase(config);
    await database.webDb.command({ ping: 1 });
    const backend = await createApiService(config.api).request({
      /**
       * Выполняет health REST-запрос с заголовками текущего корреляционного контекста через
       * настроенный транспорт.
       */
      execute: ({ headers }) =>
        getHealthReady({
          client: createTransport(config.api),
          headers: { ...headers },
        }),
      outputSchema: getHealthReady200Schema,
      context,
    });
    return backend.isOk();
  } catch {
    return false;
  }
};
