import type { Sessions } from "../../auth/ports/sessions";
import { issueSession } from "./sessions/issue";
import { findAccount, readSession } from "./sessions/read";
import { revokeSession } from "./sessions/revoke";
import { rotateSession } from "./sessions/rotate";
import type { MongoConnection } from "./types";
/**
 * Собирает порт сессий на заимствованном соединении, сохраняя транзакционные операции и
 * отменяемое чтение.
 */
export const createMongoSessions = (connection: MongoConnection): Sessions => ({
  /**
   * Читает активный аккаунт с password hash для проверки credentials через общий
   * Mongo-адаптер.
   */
  findAccount: (email) => findAccount(connection.apiDb, email),
  /** Передаёт идентификатор и сигнал отмены чтению сессии вместе с активным пользователем. */
  read: (id, signal) => readSession(connection.apiDb, id, signal),
  /** Записывает начальную сессию и событие login в транзакции общего соединения. */
  issue: (input) => issueSession(connection, input),
  /**
   * Передаёт refresh в транзакционную политику ротации, replay или отзыва при повторном
   * использовании.
   */
  rotate: (input) => rotateSession(connection, input),
  /** Применяет подтверждённый отзыв сессии и его outbox-событие через Mongo-транзакцию. */
  revoke: (input) => revokeSession(connection, input),
});
