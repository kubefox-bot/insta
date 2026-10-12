import type { BackendAuth } from "./backend-auth";
import type { SessionCrypto } from "./crypto";
import type { SessionStore } from "./store";
export type SessionDependencies = Readonly<{
  store: SessionStore;
  backend: BackendAuth;
  crypto: SessionCrypto;
  clock: () => number;
  id: () => string;
  wait: (milliseconds: number) => Promise<void>;
}>;
export type RevocationDependencies = Readonly<{
  store: Pick<SessionStore, "pendingRevocations" | "finishRevocation">;
  backend: Pick<BackendAuth, "revoke">;
  crypto: Pick<SessionCrypto, "openRevokeSecret">;
  clock: () => number;
}>;
