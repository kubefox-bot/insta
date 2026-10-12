import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";
import { sessionFixture } from "../../../../../__tests__/fixtures/chat05/session";
import type { SessionDependencies } from "../../../src/lib/session/server/ports/dependencies";
import { executeForActor } from "../../../src/lib/session/server/use-cases/execute-for-actor";

/** Удерживает backend rotation и моделирует атомарные store-порты; реальный session owner управляет lease, ожиданием и replay. */
export const createRefreshScenario = () => {
  const fixture = sessionFixture();
  const initial = fixture.state.binding;
  if (!initial) throw new Error("Missing binding");
  const rotation = Promise.withResolvers<void>();
  const committed = Promise.withResolvers<void>();
  const waiting = Promise.withResolvers<void>();
  let refreshCalls = 0;
  const tokens: string[] = [];
  const dependencies: SessionDependencies = {
    ...fixture.dependencies,
    wait: async () => {
      waiting.resolve();
      await committed.promise;
    },
    crypto: {
      ...fixture.dependencies.crypto,
      sealCredentials: async () => "rotated-cipher",
      openCredentials: async (cipher) => ({
        accessToken: cipher === "rotated-cipher" ? "rotated-access" : "access",
        refreshToken: "refresh",
      }),
    },
    backend: {
      ...fixture.dependencies.backend,
      refresh: async () => {
        refreshCalls += 1;
        await rotation.promise;
        return Result.Ok({
          user: initial.user,
          backendSessionId: initial.backendSessionId,
          accessToken: "rotated-access",
          refreshToken: "rotated-refresh",
          accessExpiresAt: 1500,
          expiresAt: 2500,
          absoluteExpiresAt: initial.absoluteExpiresAt,
        });
      },
    },
    store: {
      ...fixture.dependencies.store,
      expire: async ({ revision, now }) => {
        const current = fixture.state.binding;
        if (current?.revision === revision && now >= current.expiresAt)
          fixture.state.binding = { ...current, blocked: true };
      },
      beginRefresh: async ({ revision, attempt }) => {
        const current = fixture.state.binding;
        if (!current || current.attempt || current.revision !== revision)
          return null;
        fixture.state.binding = { ...current, attempt };
        return fixture.state.binding;
      },
      finishRefresh: async ({ revision, key, leaseGeneration, outcome }) => {
        const current = fixture.state.binding;
        if (
          !current ||
          current.revision !== revision ||
          current.attempt?.key !== key ||
          current.attempt.leaseGeneration !== leaseGeneration
        )
          return false;
        if (outcome.kind !== "success")
          throw new Error("Unexpected rotation failure");
        fixture.state.binding = {
          ...initial,
          credentials: outcome.credentials,
          revision: revision + 1,
          accessExpiresAt: outcome.accessExpiresAt,
          expiresAt: outcome.expiresAt,
        };
        committed.resolve();
        return true;
      },
    },
  };
  return {
    state: fixture.state,
    waiting: waiting.promise,
    release: () => rotation.resolve(),
    tokens,
    refreshCalls: () => refreshCalls,
    read: (actor: Readonly<{ userId: string; generation: string }>) =>
      executeForActor(
        {
          bindingId: "binding",
          actor,
          request: async (token) => {
            tokens.push(token);
            return token === "access"
              ? Result.Error({
                  code: AuthErrorCode.AccessTokenExpired,
                  status: 401,
                })
              : Result.Ok({ items: [], totalUnreadCount: 7 });
          },
        },
        dependencies,
      ),
  };
};
