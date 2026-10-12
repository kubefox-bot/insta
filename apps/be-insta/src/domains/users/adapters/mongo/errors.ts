import { MongoServerError } from "mongodb";
import type { PersistenceError } from "../../domain/types";
import { duplicateKeyCode } from "./conts";
export class PersistenceAbort extends Error {
  /**
   * Сохраняет ожидаемый отказ persistence в исключении, чтобы откатить уже начатые
   * изменения транзакции.
   */
  constructor(readonly outcome: PersistenceError) {
    super("Auth persistence precondition failed");
  }
}
/**
 * Распознаёт бизнес-откат и duplicate key; неизвестные ошибки оставляет нераспознанными
 * для дальнейшего проброса.
 */
export const expectedError = (error: unknown): PersistenceError | undefined => {
  if (error instanceof PersistenceAbort) return error.outcome;
  if (!(error instanceof MongoServerError) || error.code !== duplicateKeyCode)
    return undefined;
  if (error.keyPattern?.emailKey) return "emailExists";
  if (error.keyPattern?.usernameKey) return "usernameTaken";
  return "conflict";
};
