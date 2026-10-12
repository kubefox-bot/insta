import { Result } from "@bloodyowl/boxed";
import type { ClientSession, Db, ObjectId } from "mongodb";
import { usernameKey } from "../../../domain/policy";
import type { Activation, PersistenceError } from "../../../domain/types";
import { collections } from "../conts";
import { PersistenceAbort } from "../errors";
import { readPendingUser } from "../read-pending";
import type { ProofDocument, UserDocument } from "../types";
/**
 * В переданной транзакции переводит живую pending-регистрацию в active и потребляет
 * proof; потеря условного обновления прерывает транзакцию через PersistenceAbort.
 */
export const activateUser = async ({
  db,
  input,
  userId,
  session,
}: Readonly<{
  db: Db;
  input: Activation;
  userId: ObjectId;
  session: ClientSession;
}>): Promise<Result<ProofDocument, PersistenceError>> => {
  const users = db.collection<UserDocument>(collections.users);
  const proofs = db.collection<ProofDocument>(collections.proofs);
  await readPendingUser({ db, id: userId, now: input.now, session });
  const proof = await proofs.findOne(
    {
      userId,
      tokenDigest: input.tokenDigest,
      state: "pending",
      expiresAt: { $gt: new Date(input.now) },
    },
    { session },
  );
  if (!proof) return Result.Error("invalidProof");
  const updated = await users.updateOne(
    {
      _id: userId,
      status: "pending_setup",
      registrationExpiresAt: { $gt: new Date(input.now) },
    },
    {
      $set: {
        status: "active",
        username: input.username,
        usernameKey: usernameKey(input.username),
        passwordHash: input.passwordHash,
      },
    },
    { session },
  );
  if (updated.modifiedCount !== 1) throw new PersistenceAbort("conflict");
  const consumed = await proofs.updateOne(
    { _id: proof._id, state: "pending" },
    { $set: { state: "consumed" } },
    { session },
  );
  if (consumed.modifiedCount !== 1) throw new PersistenceAbort("conflict");
  return Result.Ok(proof);
};
