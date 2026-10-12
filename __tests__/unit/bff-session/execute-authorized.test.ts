import { expect, mock, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode, SessionErrorCode } from "@insta/contracts/errors";
import type { SessionDependencies } from "../../../apps/fe-insta/src/lib/session/server/ports/dependencies";
import type { BackendError } from "../../../apps/fe-insta/src/lib/session/server/types";
import { executeAuthorized } from "../../../apps/fe-insta/src/lib/session/server/use-cases/execute-authorized";
import { sessionFixture } from "../../fixtures/chat05/session";

/** Моделирует успешную ротацию через session ports: сохраняет попытку и новую revision в собственном состоянии, оставляя остальные lifecycle-операции запрещёнными. */
const refreshFixture = () => {
  const fixture = sessionFixture();
  const initial = fixture.state.binding;
  if (!initial) throw new Error("Missing fixture binding");
  const refresh = mock(async () =>
    Result.Ok({
      user: initial.user,
      backendSessionId: initial.backendSessionId,
      accessToken: "rotated-access",
      refreshToken: "rotated-refresh",
      accessExpiresAt: 1500,
      expiresAt: 2500,
      absoluteExpiresAt: initial.absoluteExpiresAt,
    }),
  );
  const block = mock(async () => {});
  const dependencies: SessionDependencies = {
    ...fixture.dependencies,
    backend: { ...fixture.dependencies.backend, refresh },
    crypto: {
      ...fixture.dependencies.crypto,
      sealCredentials: async () => "rotated-cipher",
      openCredentials: async (cipher) => ({
        accessToken: cipher === "rotated-cipher" ? "rotated-access" : "access",
        refreshToken: "refresh",
      }),
    },
    store: {
      ...fixture.dependencies.store,
      block,
      beginRefresh: async ({ attempt }) => {
        fixture.state.binding = { ...initial, attempt };
        return fixture.state.binding;
      },
      finishRefresh: async ({ outcome }) => {
        if (outcome.kind !== "success") throw new Error("Refresh failed");
        fixture.state.binding = {
          ...initial,
          credentials: outcome.credentials,
          revision: initial.revision + 1,
          accessExpiresAt: outcome.accessExpiresAt,
          expiresAt: outcome.expiresAt,
        };
        return true;
      },
      expire: async () => {},
    },
  };
  return { ...fixture, dependencies, refresh, block };
};

for (const failure of ["request", "crypto", "block"] as const) {
  test(`only replay ${failure} rejection maps to SESSION_UNAVAILABLE after one successful refresh`, async () => {
    const fixture = refreshFixture();
    const openCredentials = mock(async (cipher: string) => {
      if (failure === "crypto" && cipher === "rotated-cipher")
        throw new Error("Replay decryption failed");
      return fixture.dependencies.crypto.openCredentials(cipher);
    });
    const block = mock(async () => {
      throw new Error("Replay session block failed");
    });
    const request = mock(
      async (token: string): Promise<Result<string, BackendError>> => {
        if (token === "access")
          return Result.Error({ code: AuthErrorCode.AccessTokenExpired });
        if (failure === "request") throw new Error("Replay request failed");
        return Result.Error({ code: AuthErrorCode.SessionRevoked });
      },
    );
    const result = await executeAuthorized(
      { bindingId: "binding", expectedUserId: "alice", request },
      {
        ...fixture.dependencies,
        crypto: { ...fixture.dependencies.crypto, openCredentials },
        store: { ...fixture.dependencies.store, block },
      },
    );
    expect(result).toMatchObject({
      tag: "Error",
      error: SessionErrorCode.SessionUnavailable,
    });
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.state.binding?.revision).toBe(1);
    expect(openCredentials).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.map(([token]) => token)).toEqual(
      failure === "crypto" ? ["access"] : ["access", "rotated-access"],
    );
    expect(block).toHaveBeenCalledTimes(failure === "block" ? 1 : 0);
  });
}

test("replay never does not refresh or repeat a mutation after access expiry", async () => {
  const fixture = refreshFixture();
  const request = mock(async () =>
    Result.Error({ code: AuthErrorCode.AccessTokenExpired }),
  );
  const result = await executeAuthorized(
    { bindingId: "binding", replay: "never", request },
    fixture.dependencies,
  );
  expect(result).toMatchObject({
    tag: "Error",
    error: { code: AuthErrorCode.AccessTokenExpired },
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(fixture.refresh).not.toHaveBeenCalled();
});

for (const fence of ["logout", "actor"] as const) {
  test(`successful refresh rechecks ${fence} before replay`, async () => {
    const fixture = refreshFixture();
    const read = mock(async () => {
      const current = fixture.state.binding;
      if (read.mock.calls.length !== 4 || !current) return current;
      return fence === "logout"
        ? { ...current, blocked: true }
        : { ...current, user: { id: "bob", username: "Bob" } };
    });
    const request = mock(async () =>
      Result.Error({ code: AuthErrorCode.AccessTokenExpired }),
    );
    const result = await executeAuthorized(
      { bindingId: "binding", expectedUserId: "alice", request },
      {
        ...fixture.dependencies,
        store: { ...fixture.dependencies.store, read },
      },
    );
    expect(result).toMatchObject({
      tag: "Error",
      error:
        fence === "logout"
          ? SessionErrorCode.SessionRequired
          : SessionErrorCode.ActorChanged,
    });
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
}
