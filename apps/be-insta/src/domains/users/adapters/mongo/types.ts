import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import type { ClientSession, Db, ObjectId } from "mongodb";
export type MongoConnection = Readonly<{
  apiDb: Db;
  startSession: () => ClientSession;
  clock: () => number;
  analyticsReference?: () => ConsentReference | undefined;
}>;
export type UserDocument =
  | {
      _id: ObjectId;
      status: "pending_setup";
      emailKey: string;
      emailVerifiedAt: Date;
      registrationExpiresAt: Date;
    }
  | {
      _id: ObjectId;
      status: "active";
      emailKey: string;
      emailVerifiedAt: Date;
      registrationExpiresAt: Date;
      username: string;
      usernameKey: string;
      passwordHash: string;
    };
export type ProofDocument = {
  _id: ObjectId;
  userId: ObjectId;
  tokenDigest: string;
  state: "pending" | "consumed";
  expiresAt: Date;
};
export type SessionDocument = {
  _id: ObjectId;
  userId: ObjectId;
  backendSessionId: string;
  refreshDigest: string;
  revokeDigest: string;
  generation: number;
  state: "active" | "revoked" | "expired";
  issuedAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
};
export type ReplayDocument = {
  _id: ObjectId;
  owner: ObjectId;
  operation: string;
  keyDigest: string;
  tokenDigest: string;
  fingerprint: string;
  ciphertext: string;
  operationId: string;
  backendSessionId: string;
  generation: number;
  expiresAt: Date;
};
export type RotatingSessionDocument = SessionDocument & {
  previousRefresh?: Array<{
    digest: string;
    keyDigest: string;
    fingerprint: string;
    generation: number;
  }>;
  revokeOperationId?: string;
};
