import { Result } from "@bloodyowl/boxed";
import type { SessionDependencies } from "../../../apps/fe-insta/src/lib/session/server/index";
import type { Binding } from "../../../apps/fe-insta/src/lib/session/server/types";
export const sessionFixture = () => {
  const binding: Binding = {
    bindingId: "binding",
    user: { id: "alice", username: "Alice" },
    backendSessionId: "login1",
    credentials: "cipher",
    revokeSecret: "cipher",
    revision: 0,
    accessExpiresAt: 1000,
    expiresAt: 2000,
    absoluteExpiresAt: 3000,
    blocked: false,
  };
  const state: { binding: Binding | null; authorized: boolean } = {
    binding,
    authorized: true,
  };
  const unexpected = async () => {
    throw new Error("Unexpected lifecycle operation");
  };
  const dependencies: SessionDependencies = {
    clock: () => 10,
    id: () => "id",
    wait: unexpected,
    crypto: {
      sealCredentials: unexpected,
      openCredentials: async () => ({
        accessToken: "access",
        refreshToken: "refresh",
      }),
      sealRevokeSecret: unexpected,
      openRevokeSecret: unexpected,
    },
    store: {
      create: unexpected,
      read: async () => state.binding,
      beginRefresh: unexpected,
      takeOver: unexpected,
      finishRefresh: unexpected,
      block: unexpected,
      expire: unexpected,
      beginRevocation: unexpected,
      pendingRevocations: unexpected,
      finishRevocation: unexpected,
    },
    backend: {
      authorize: async () =>
        state.authorized && state.binding
          ? Result.Ok({
              userId: state.binding.user.id,
              username: state.binding.user.username,
              sessionId: state.binding.backendSessionId,
            })
          : Result.Error({ code: "ACCESS_TOKEN_INVALID" }),
      refresh: unexpected,
      revoke: unexpected,
    },
  };
  return { state, dependencies };
};
