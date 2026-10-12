import type { AuthPersistence } from "../../ports/auth-persistence";
import { activationOperation } from "./activation";
import { createPendingOperation } from "./create-pending";
import { replaceProofOperation } from "./replace-proof";
import type { MongoConnection } from "./types";
/**
 * Собирает операции pending-регистрации, замены proof и атомарной активации на одном
 * заимствованном Mongo-соединении.
 */
export const createMongoAuthPersistence = (
  connection: MongoConnection,
): AuthPersistence => ({
  createPending: createPendingOperation(connection),
  replaceProof: replaceProofOperation(connection),
  activateAndIssueSession: activationOperation(connection),
});
