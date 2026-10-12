import { expect } from "bun:test";
import { RedisClient } from "bun";
import { waitUntil } from "../../../../__tests__/fixtures/barrier";
import { readTestApiConfig } from "../../../../__tests__/fixtures/environment";
import { createAuthEnvironment } from "../../../../__tests__/fixtures/users/auth-environment";
import { createApplication } from "../../src/app/bootstrap";
import { createInfrastructureReadiness } from "../../src/app/health/readiness/index";
import { deliveryStreamsNamespace } from "../../src/domains/conversations/server/index";
import { maintenancePolicy } from "../../src/domains/stories/domain/maintenance/conts";
import { createStoryMaintenance } from "../../src/domains/stories/index";
import {
  createStoriesPersistence,
  createStoryJobs,
} from "../../src/domains/stories/server/index";
import { sessionCredentialsSchema } from "../../src/domains/users/auth/domain/credentials";
import {
  connectDragonfly,
  readGeneration,
} from "../../src/lib/dragonfly/index";

const fixture = await createAuthEnvironment({
  collectionNamespace: `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
});
try {
  const broker = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  try {
    const persistence = await createStoriesPersistence({
      db: fixture.database.apiDb,
      startSession: fixture.database.startSession,
    });
    const provider = { unavailable: true, calls: 0 };
    const schedules = new Map<() => void, number>();
    const maintenance = createStoryMaintenance({
      ...persistence,
      profiles: [{ id: fixture.runId, prefix: `${fixture.runId}/` }],
      clock: Date.now,
      invalidate: async () => {},
      storage: {
        list: async () => {
          provider.calls++;
          if (provider.unavailable)
            throw new Error("Controlled storage inventory failure");
          return { objects: [] };
        },
        putUnique: async () => {
          throw new Error("Unexpected upload");
        },
        read: async () => {
          throw new Error("Unexpected read");
        },
        delete: async () => {
          throw new Error("Unexpected delete");
        },
        signPlayback: () => {
          throw new Error("Unexpected playback");
        },
      },
    });
    const jobs = createStoryJobs({
      ...maintenance,
      timers: {
        every: (callback, ms) => {
          schedules.set(callback, ms);
          return () => {
            schedules.delete(callback);
          };
        },
        after: () => () => {},
      },
    });
    const databaseAvailability = { ready: true };
    const infrastructure = {
      database: {
        apiDb: {
          command: async (command: Record<string, unknown>) => {
            if (!databaseAvailability.ready)
              throw new Error("Controlled Mongo command failure");
            return fixture.database.apiDb.command(command);
          },
        },
      },
      broker,
      timeoutMs: 1000,
      mailpitUrl: readTestApiConfig().mailpitUrl,
      deliveryProbe: {
        authIdentity: (await readGeneration(broker)).slice(0, 40),
        open: () =>
          new RedisClient(readTestApiConfig().deliveryDragonfly.url, {
            autoReconnect: false,
            connectionTimeout: 500,
          }),
        namespace: deliveryStreamsNamespace,
        timeoutMs: 500,
      },
      mailStatus: () => "ok" as const,
      storiesStatus: jobs.status,
    };
    const readiness = createInfrastructureReadiness(infrastructure);
    const app = await createApplication(
      {
        users: fixture.users,
        ...readiness,
        close: jobs.close,
      },
      { mode: "offline" },
    );
    try {
      await app.listen(0, "127.0.0.1");
      const url = await app.getUrl();
      const account = await fixture.account();
      jobs.start();
      await waitUntil({
        check: async () => infrastructure.storiesStatus() === "degraded",
      });
      const failedJobStatus = infrastructure.storiesStatus();
      const failedCalls = provider.calls;
      const health = await fetch(`${url}/health/ready`);
      const healthBody = await health.json();
      const login = await fetch(`${url}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(account),
      });
      const loginBody = await login.json();
      const credentials = login.ok
        ? sessionCredentialsSchema.parse(loginBody.data)
        : undefined;
      const me = await fetch(`${url}/v1/me`, {
        headers: {
          authorization: `Bearer ${credentials?.accessToken ?? "invalid"}`,
        },
      });
      const meBody = await me.json();
      provider.unavailable = false;
      const reconcile = [...schedules].find(
        ([, ms]) => ms === maintenancePolicy.reconcileMs,
      )?.[0];
      if (!reconcile) throw new Error("Missing scheduled reconciliation");
      reconcile();
      await waitUntil({
        check: async () => infrastructure.storiesStatus() === "ok",
      });
      const recoveredHealth = await fetch(`${url}/health/ready`);
      const recoveredBody = await recoveredHealth.json();
      console.log(
        JSON.stringify({
          failedJobStatus,
          failedCalls,
          degradedHealth: health.status,
          degradedLogin: login.status,
          degradedMe: me.status,
          loginError: loginBody.error?.code,
          recoveredJobStatus: infrastructure.storiesStatus(),
          recoveredCalls: provider.calls,
          recoveredHealth: recoveredHealth.status,
        }),
      );
      expect(failedJobStatus).toBe("degraded");
      expect(failedCalls).toBe(1);
      expect(login.status).toBe(200);
      expect(health.status).toBe(200);
      expect(healthBody).toMatchObject({
        ok: true,
        data: { status: "ok" },
      });
      expect(me.status).toBe(200);
      expect(meBody.data.id).toBe(credentials?.user.id);
      if (!credentials) throw new Error("Missing successful login");
      expect(recoveredBody).toMatchObject({
        ok: true,
        data: { status: "ok" },
      });
      expect(provider.calls).toBe(2);
      databaseAvailability.ready = false;
      const databaseUnavailable = await fetch(`${url}/v1/me`, {
        headers: { authorization: `Bearer ${credentials.accessToken}` },
      });
      expect(databaseUnavailable.status).toBe(503);
      expect((await databaseUnavailable.json()).error.code).toBe(
        "DEPENDENCY_UNAVAILABLE",
      );
      databaseAvailability.ready = true;
      const databaseRecovered = await fetch(`${url}/v1/me`, {
        headers: { authorization: `Bearer ${credentials.accessToken}` },
      });
      expect(databaseRecovered.status).toBe(200);
      await databaseRecovered.body?.cancel();
      broker.close();
      const unavailable = await fetch(`${url}/v1/me`, {
        headers: { authorization: `Bearer ${credentials.accessToken}` },
      });
      expect(unavailable.status).toBe(503);
      expect((await unavailable.json()).error.code).toBe(
        "DEPENDENCY_UNAVAILABLE",
      );
      const live = await fetch(`${url}/health/live`);
      expect(live.status).toBe(200);
      await live.body?.cancel();
      console.log(
        JSON.stringify({
          maintenanceIsolation: "passed",
          recovery: "passed",
          requiredBroker: "fail-closed",
          requiredDatabase: "fail-closed",
        }),
      );
    } finally {
      await app.close();
      await jobs.close();
    }
  } finally {
    broker.close();
  }
} finally {
  await fixture.dispose();
}
