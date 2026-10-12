import type { Reports } from "../../ports/reports";
import { cleanupSupportReports } from "./cleanup";
import { supportCollectionNames } from "./collections";
import { createSupportDelivery } from "./delivery";
import { readSupportReplay } from "./replay";
import { saveSupportReport } from "./save";
import type { Connection } from "./types";
/**
 * Создаёт индексы поиска ожидающей почты и истёкших replay в выбранном namespace; ошибки
 * Mongo передаёт запуску.
 */
export const ensureSupportIndexes = async (connection: Connection) => {
  const collections = supportCollectionNames(connection.namespace);
  await connection.apiDb
    .collection(collections.reports)
    .createIndex({ emailState: 1, nextAttemptAt: 1, leaseUntil: 1 });
  await connection.apiDb
    .collection(collections.replays)
    .createIndex({ expiresAt: 1 });
};
/**
 * Собирает порт отчётов из транзакционной записи, replay, доставки и очистки на одном
 * заимствованном соединении.
 */
export const createMongoReports = (connection: Connection): Reports => ({
  save: saveSupportReport(connection),
  replay: readSupportReplay(connection),
  ...createSupportDelivery(connection),
  cleanup: cleanupSupportReports(connection),
});
