import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode, SessionErrorCode } from "@insta/contracts/errors";
import { createMongoSessionStore } from "../../../apps/fe-insta/src/lib/session/server/adapters/mongo/store";
import type { BackendAuth } from "../../../apps/fe-insta/src/lib/session/server/ports/backend-auth";
import { logout } from "../../../apps/fe-insta/src/lib/session/server/use-cases/logout";
import { refreshBinding } from "../../../apps/fe-insta/src/lib/session/server/use-cases/refresh";
import { resolveActor } from "../../../apps/fe-insta/src/lib/session/server/use-cases/resolve-actor";
import { retryPendingRevocations } from "../../../apps/fe-insta/src/lib/session/server/use-cases/retry-revocation";
import { createBffEnvironment } from "../../fixtures/bff-session/environment";

test("unknown native commit recovers same attempt after old expiry; original revoke survives rotations and restart", async () => {
  const f = await createBffEnvironment();
  try {
    const first = await f.binding();
    f.native.advance(604799000);
    const lostReply = {
      ...f.dependencies,
      backend: {
        ...f.dependencies.backend,
        refresh: async (
          input: Parameters<typeof f.dependencies.backend.refresh>[0],
        ) => {
          const committed = await f.dependencies.backend.refresh(input);
          expect(committed.isOk()).toBe(true);
          return Result.Error({ code: SessionErrorCode.SessionUnavailable });
        },
      },
    };
    expect(
      (
        await refreshBinding(
          { bindingId: first.bindingId, revision: 0 },
          lostReply,
        )
      ).isError(),
    ).toBe(true);
    const unknown = await f.dependencies.store.read(first.bindingId);
    expect(unknown?.attempt?.state).toBe("unknown");
    expect(unknown?.revision).toBe(0);
    f.native.advance(2000);
    const recovered = await refreshBinding(
      { bindingId: first.bindingId, revision: 0 },
      f.dependencies,
    );
    expect(recovered.isOk()).toBe(true);
    if (recovered.isError()) throw new Error(recovered.getError());
    expect(recovered.get().revokeSecret).toBe(first.revokeSecret);
    expect(recovered.get().revision).toBe(1);
    const rotated = await refreshBinding(
      { bindingId: first.bindingId, revision: 1 },
      f.dependencies,
    );
    expect(rotated.isOk()).toBe(true);
    const offline = {
      ...f.dependencies,
      backend: {
        ...f.dependencies.backend,
        revoke: async () =>
          Result.Error({ code: SessionErrorCode.SessionUnavailable }),
      },
    };
    const pending = await logout({ bindingId: first.bindingId }, offline);
    expect(pending.isOk() && pending.get().revocation).toBe("pending");
    const saved = await f.dependencies.store.read(first.bindingId);
    expect(saved?.blocked).toBe(true);
    expect(saved?.revocation?.key).toBeDefined();
    expect(saved?.cleanupAt).toBeUndefined();
    expect(
      (
        await refreshBinding(
          { bindingId: first.bindingId, revision: 2 },
          f.dependencies,
        )
      ).isError(),
    ).toBe(true);
    const second = await f.binding();
    expect((await f.dependencies.store.read(second.bindingId))?.blocked).toBe(
      false,
    );
    f.native.advance(1000);
    const restarted = {
      ...f.dependencies,
      store: createMongoSessionStore(f.web.webDb, f.collectionName),
    };
    const worker = Bun.spawn(
      [
        process.execPath,
        "__tests__/fixtures/bff-session/revocation-process.ts",
        f.collectionName,
        String(f.native.clock()),
      ],
      { stdout: "pipe", stderr: "pipe", timeout: 15000 },
    );
    expect(await worker.exited).toBe(0);
    expect(
      (await resolveActor({ bindingId: second.bindingId }, restarted)).isOk(),
    ).toBe(true);
    expect(
      (await restarted.store.read(first.bindingId))?.revocation,
    ).toBeUndefined();
    expect((await restarted.store.read(second.bindingId))?.blocked).toBe(false);
    expect(
      (await resolveActor({ bindingId: first.bindingId }, restarted)).isError(),
    ).toBe(true);
    expect(
      await f.native.db.collection("users_outbox").countDocuments({
        backendSessionId: first.backendSessionId,
        type: "logout_completed",
      }),
    ).toBe(1);
  } finally {
    await f.dispose();
  }
});

test("exact cutoff blocks unknown and never sends another rotation; failed durable intent is not pending success", async () => {
  const f = await createBffEnvironment();
  try {
    const binding = await f.binding();
    const offline = {
      ...f.dependencies,
      backend: {
        ...f.dependencies.backend,
        refresh: async () =>
          Result.Error({ code: SessionErrorCode.SessionUnavailable }),
      },
    };
    await refreshBinding(
      { bindingId: binding.bindingId, revision: 0 },
      offline,
    );
    f.native.advance(120000);
    const result = await refreshBinding(
      { bindingId: binding.bindingId, revision: 0 },
      f.dependencies,
    );
    expect(String(result.isError() && result.getError())).toBe(
      "SESSION_REQUIRED",
    );
    expect((await f.dependencies.store.read(binding.bindingId))?.blocked).toBe(
      true,
    );
    expect(
      await f.native.db.collection("users_outbox").countDocuments({
        backendSessionId: binding.backendSessionId,
        type: "session_rotated",
      }),
    ).toBe(0);
    const { connectDatabase } = await import(
      "../../../apps/fe-insta/src/lib/database/server/index"
    );
    const failedConnection = await connectDatabase({ config: f.config.mongo });
    const unavailableStore = createMongoSessionStore(
      failedConnection.webDb,
      f.collectionName,
    );
    await failedConnection.close();
    const failPersist = { ...f.dependencies, store: unavailableStore };
    const logoutResult = await logout(
      { bindingId: binding.bindingId },
      failPersist,
    );
    expect(String(logoutResult.isError() && logoutResult.getError())).toBe(
      "SESSION_UNAVAILABLE",
    );
    expect(
      (await f.dependencies.store.read(binding.bindingId))?.revocation,
    ).toBeUndefined();
  } finally {
    await f.dispose();
  }
});

test("worker backs off throwing provider failures through a bounded wave without losing persisted task", async () => {
  const f = await createBffEnvironment();
  try {
    const binding = await f.binding();
    const offline = {
      ...f.dependencies,
      backend: {
        ...f.dependencies.backend,
        revoke: async () => {
          throw new Error("isolated connection failure");
        },
      },
    };
    const result = await logout({ bindingId: binding.bindingId }, offline);
    expect(result.isOk() && result.get().revocation).toBe("pending");
    expect(
      (await f.dependencies.store.read(binding.bindingId))?.revocation
        ?.nextAttemptAt,
    ).toBe(f.native.clock() + 1000);
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      f.native.advance(delay);
      await retryPendingRevocations(offline);
    }
    const pending = await f.dependencies.store.read(binding.bindingId);
    expect(pending?.revocation?.failures).toBe(6);
    expect(pending?.revocation?.nextAttemptAt).toBe(f.native.clock() + 60000);
    expect(pending?.blocked).toBe(true);
  } finally {
    await f.dispose();
  }
});

for (const staleOutcome of ["success", "invalid", "revoked"] as const) {
  test(`two independent BFF processes fence late ${staleOutcome} after lease takeover`, async () => {
    const f = await createBffEnvironment();
    const children: ReturnType<typeof Bun.spawn>[] = [];
    try {
      const binding = await f.binding();
      const launch = (now: number) => {
        const child = Bun.spawn(
          [
            process.execPath,
            "__tests__/fixtures/bff-session/refresh-process.ts",
            binding.bindingId,
            f.collectionName,
            String(now),
          ],
          { stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: 15000 },
        );
        children.push(child);
        return child;
      };
      const first = launch(f.native.clock());
      const firstReader = first.stdout.getReader();
      const firstEntered = JSON.parse(
        new TextDecoder().decode((await firstReader.read()).value),
      );
      expect(firstEntered.entered).toBe(true);
      const second = launch(f.native.clock() + 15000);
      const secondReader = second.stdout.getReader();
      const secondEntered = JSON.parse(
        new TextDecoder().decode((await secondReader.read()).value),
      );
      expect(secondEntered.key).toBe(firstEntered.key);
      second.stdin.write("success");
      second.stdin.end();
      expect(await second.exited).toBe(0);
      expect(
        (await f.dependencies.store.read(binding.bindingId))?.revision,
      ).toBe(1);
      first.stdin.write(staleOutcome);
      first.stdin.end();
      expect(await first.exited).toBe(0);
      const current = await f.dependencies.store.read(binding.bindingId);
      expect(current?.blocked).toBe(staleOutcome === "revoked");
      expect(current?.revision).toBe(1);
      expect(current?.revokeSecret).toBe(binding.revokeSecret);
      firstReader.releaseLock();
      secondReader.releaseLock();
    } finally {
      for (const child of children) {
        if (child.exitCode === null) child.kill();
      }
      await f.dispose();
    }
  });
}

test("authorized requests check expected account, replay expired guard once, and never replay streaming requests", async () => {
  const { executeAuthorized } = await import(
    "../../../apps/fe-insta/src/lib/session/server/use-cases/execute-authorized"
  );
  const f = await createBffEnvironment();
  try {
    const binding = await f.binding();
    let requests = 0;
    const request = async (
      token: string,
    ): ReturnType<BackendAuth["authorize"]> => {
      requests += 1;
      return f.dependencies.backend.authorize(token);
    };
    expect(
      (
        await executeAuthorized(
          {
            bindingId: binding.bindingId,
            expectedUserId: "different-account",
            request,
          },
          f.dependencies,
        )
      ).isError(),
    ).toBe(true);
    expect(requests).toBe(0);
    f.native.advance(900000);
    expect(
      (
        await executeAuthorized(
          {
            bindingId: binding.bindingId,
            expectedUserId: binding.user.id,
            request,
          },
          f.dependencies,
        )
      ).isOk(),
    ).toBe(true);
    expect(requests).toBe(2);
    expect((await f.dependencies.store.read(binding.bindingId))?.revision).toBe(
      1,
    );
    let rejectedRequests = 0;
    const expiredGuard = async (): ReturnType<BackendAuth["authorize"]> => {
      rejectedRequests += 1;
      return Result.Error({ code: AuthErrorCode.AccessTokenExpired });
    };
    await executeAuthorized(
      { bindingId: binding.bindingId, replay: "never", request: expiredGuard },
      f.dependencies,
    );
    expect(rejectedRequests).toBe(1);
    expect((await f.dependencies.store.read(binding.bindingId))?.revision).toBe(
      1,
    );
    await executeAuthorized(
      { bindingId: binding.bindingId, request: expiredGuard },
      f.dependencies,
    );
    expect(rejectedRequests).toBe(3);
    expect((await f.dependencies.store.read(binding.bindingId))?.revision).toBe(
      2,
    );
  } finally {
    await f.dispose();
  }
});

test("native revocation is a terminal BFF actor result, not transient unavailability", async () => {
  const f = await createBffEnvironment();
  try {
    const binding = await f.binding();
    const revoked = await f.dependencies.backend.revoke({
      backendSessionId: binding.backendSessionId,
      revokeSecret: await f.dependencies.crypto.openRevokeSecret(
        binding.revokeSecret,
      ),
      key: crypto.randomUUID(),
    });
    expect(revoked.isOk()).toBe(true);
    const actor = await resolveActor(
      { bindingId: binding.bindingId },
      f.dependencies,
    );
    expect(String(actor.isError() && actor.getError())).toBe(
      "SESSION_REQUIRED",
    );
    expect((await f.dependencies.store.read(binding.bindingId))?.blocked).toBe(
      true,
    );
  } finally {
    await f.dispose();
  }
});
