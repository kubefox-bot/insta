import type { readRuntimeConfig } from "../../../../lib/config/server/index";
import { connectDatabase } from "../../../../lib/database/server/index";

// Promise ownership is local to this process; failed acquisition is not retained.
const state: {
  database?: Awaited<ReturnType<typeof connectDatabase>>;
  pending?: ReturnType<typeof connectDatabase>;
  acquisition?: AbortController;
} = {};
/**
 * Выдаёт общую процессную БД, объединяя параллельные подключения; неуспешная попытка не
 * кешируется. Получатель заимствует клиент, закрытие принадлежит closeInfrastructure.
 */
export const acquireDatabase = async (
  config: ReturnType<typeof readRuntimeConfig>,
) => {
  if (state.database) return state.database;
  if (!state.pending) {
    state.acquisition = new AbortController();
    state.pending = connectDatabase({
      config: config.mongo,
      signal: state.acquisition.signal,
    });
  }
  try {
    state.database = await state.pending;
    return state.database;
  } finally {
    state.pending = undefined;
  }
};
/**
 * Отменяет незавершённое подключение, ждёт его исхода и закрывает полученный процессный
 * клиент; ошибка закрытия остаётся вызывающему коду.
 */
export const closeInfrastructure = async () => {
  cancelDatabaseAcquisition();
  const database =
    state.database ?? (await state.pending?.catch(() => undefined));
  await database?.close();
};
/**
 * Посылает сигнал отмены текущему подключению Mongo; само завершение подключения этим вызовом
 * не подтверждается.
 */
export const cancelDatabaseAcquisition = () => state.acquisition?.abort();
