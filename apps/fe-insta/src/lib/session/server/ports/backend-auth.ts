import type { Result } from "@bloodyowl/boxed";
import type { BackendError, RefreshCredentials } from "../types";
export type BackendAuth = Readonly<{
  refresh: (
    input: Readonly<{ refreshToken: string; key: string }>,
  ) => Promise<Result<RefreshCredentials, BackendError>>;
  revoke: (
    input: Readonly<{
      backendSessionId: string;
      revokeSecret: string;
      key: string;
    }>,
  ) => Promise<
    Result<Readonly<{ state: "revoked" | "expired" }>, BackendError>
  >;
  authorize: (
    accessToken: string,
  ) => Promise<
    Result<Readonly<{ userId: string; username: string }>, BackendError>
  >;
}>;
