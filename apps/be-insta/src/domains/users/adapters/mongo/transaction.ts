import { Result } from "@bloodyowl/boxed";
import type { ClientSession } from "mongodb";
import type { PersistenceError } from "../../domain/types";
import { transactionOptions } from "./conts";
import { expectedError } from "./errors";
import type { MongoConnection } from "./types";
/**
 * Владеет временной Mongo-session и освобождает её после завершения withTransaction;
 * драйвер может повторно вызвать операцию по своей транзакционной политике.
 */
export const usersTransaction = async <T>({
  connection,
  operation,
}: Readonly<{
  connection: MongoConnection;
  operation: (session: ClientSession) => Promise<T>;
}>): Promise<T> => {
  await using session = connection.startSession();
  return await session.withTransaction(operation, transactionOptions);
};
/**
 * Проводит auth-операцию в управляемой транзакции; распознанные бизнес-откаты и duplicate
 * key переводит в Result, остальные исключения сохраняет.
 */
export const authTransaction = async <T>({
  connection,
  operation,
}: Readonly<{
  connection: MongoConnection;
  operation: (session: ClientSession) => Promise<Result<T, PersistenceError>>;
}>): Promise<Result<T, PersistenceError>> => {
  try {
    return await usersTransaction({ connection, operation });
  } catch (error) {
    const outcome = expectedError(error);
    if (outcome) return Result.Error(outcome);
    throw error;
  }
};
