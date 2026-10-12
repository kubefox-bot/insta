import { expect, test } from "bun:test";
import { startSupportWorker } from "../../../src/domains/support-reports/adapters/worker";
import type { MailJob } from "../../../src/domains/support-reports/domain/types";
import type { MailWorkerDependencies } from "../../../src/domains/support-reports/ports/types";

const job: MailJob = {
  reportId: "report",
  owner: { kind: "guest", id: "owner" },
  comment: "test",
  errorCode: "TECHNICAL_PROBLEM",
  fingerprint: "test",
  idempotencyKey: "key",
  operationId: "operation",
  createdAt: 0,
  expiresAt: 100000,
  replayExpiresAt: 100000,
  leaseId: "lease",
  attempts: 1,
};

test("SMTP rejection degrades worker despite successful retry persistence", async () => {
  const persisted: string[] = [];
  const finished = Promise.withResolvers<void>();
  const dependencies: MailWorkerDependencies = {
    clock: () => 1000,
    uuid: () => "lease",
    jobs: { next: async () => null, acknowledge: async () => {} },
    reports: {
      cleanup: async () => {},
      recover: async () => ["report"],
      claim: async () => job,
      finish: async ({ state }) => {
        persisted.push(state);
        finished.resolve();
      },
    },
    email: {
      send: async () => {
        throw new Error("SMTP rejected");
      },
    },
  };
  const worker = startSupportWorker(dependencies);
  await finished.promise;
  await worker.close();
  expect(persisted).toEqual(["retry"]);
  expect(worker.status()).toBe("degraded");
});

import { deliveryHealth } from "../../../src/domains/support-reports/adapters/worker-health";
import { dispatchSupportMail } from "../../../src/domains/support-reports/use-cases/dispatch";

const fixture = () => {
  const persisted: string[] = [];
  const dependencies: MailWorkerDependencies = {
    clock: () => 1000,
    uuid: () => "lease",
    jobs: { next: async () => null, acknowledge: async () => {} },
    reports: {
      cleanup: async () => {},
      recover: async () => ["report"],
      claim: async () => job,
      finish: async ({ state }) => {
        persisted.push(state);
      },
    },
    email: { send: async () => "accepted" as const },
  };
  return { dependencies, persisted };
};

test("delivery mapping retains retry through idle and recovers after acceptance", () => {
  const rejected = deliveryHealth({
    previous: "ok",
    summary: { accepted: 0, retry: 1 },
  });
  const idle = deliveryHealth({
    previous: rejected,
    summary: { accepted: 0, retry: 0 },
  });
  expect(rejected).toBe("degraded");
  expect(idle).toBe("degraded");
  expect(
    deliveryHealth({ previous: idle, summary: { accepted: 1, retry: 0 } }),
  ).toBe("ok");
  expect(
    deliveryHealth({ previous: "ok", summary: { accepted: 1, retry: 1 } }),
  ).toBe("degraded");
});

test("mixed batch aggregates durable outcomes and acknowledges the queue hint", async () => {
  const { dependencies, persisted } = fixture();
  const acknowledged: string[] = [];
  const mixed = {
    ...dependencies,
    jobs: {
      next: async () => ({ id: "hint", reportId: "accepted" }),
      acknowledge: async (id: string) => {
        acknowledged.push(id);
      },
    },
    reports: {
      ...dependencies.reports,
      recover: async () => ["accepted", "retry", "idle"],
      claim: async ({ reportId }: { reportId: string }) =>
        reportId === "idle" ? null : { ...job, reportId },
    },
    email: {
      send: async ({ reportId }: MailJob) => {
        if (reportId === "retry") throw new Error("SMTP");
        return "accepted" as const;
      },
    },
  };
  expect(
    await dispatchSupportMail(mixed, new AbortController().signal),
  ).toEqual({ accepted: 1, retry: 1 });
  expect(persisted).toEqual(["accepted", "retry"]);
  expect(acknowledged).toEqual(["hint"]);
});

test("acceptance does not clear failed cleanup health", async () => {
  const { dependencies, persisted } = fixture();
  const finished = Promise.withResolvers<void>();
  const worker = startSupportWorker({
    ...dependencies,
    reports: {
      ...dependencies.reports,
      cleanup: async () => {
        throw new Error("cleanup");
      },
      finish: async ({ state }) => {
        persisted.push(state);
        finished.resolve();
      },
    },
  });
  await finished.promise;
  await worker.close();
  expect(persisted).toEqual(["accepted"]);
  expect(worker.status()).toBe("degraded");
});

test("finish failure degrades delivery and leaves the hint unacknowledged", async () => {
  const { dependencies } = fixture();
  const finished = Promise.withResolvers<void>();
  const acknowledged: string[] = [];
  const worker = startSupportWorker({
    ...dependencies,
    jobs: {
      next: async () => ({ id: "hint", reportId: "report" }),
      acknowledge: async (id) => {
        acknowledged.push(id);
      },
    },
    reports: {
      ...dependencies.reports,
      finish: async () => {
        finished.resolve();
        throw new Error("finish");
      },
    },
  });
  await finished.promise;
  await worker.close();
  expect(worker.status()).toBe("degraded");
  expect(acknowledged).toEqual([]);
});

test("close waits for pending send settlement and cancels subsequent claims", async () => {
  const { dependencies, persisted } = fixture();
  const sending = Promise.withResolvers<void>();
  const settle = Promise.withResolvers<void>();
  const claims: string[] = [];
  const acknowledged: string[] = [];
  const worker = startSupportWorker({
    ...dependencies,
    jobs: {
      next: async () => ({ id: "hint", reportId: "report" }),
      acknowledge: async (id) => {
        acknowledged.push(id);
      },
    },
    reports: {
      ...dependencies.reports,
      recover: async () => ["report", "second"],
      claim: async ({ reportId }) => {
        claims.push(reportId);
        return { ...job, reportId };
      },
    },
    email: {
      send: async () => {
        sending.resolve();
        await settle.promise;
        return "accepted" as const;
      },
    },
  });
  await sending.promise;
  let closed = false;
  const closing = worker.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  expect(persisted).toEqual([]);
  settle.resolve();
  await closing;
  expect(closed).toBe(true);
  expect(persisted).toEqual(["accepted"]);
  expect(claims).toEqual(["report"]);
  expect(acknowledged).toEqual(["hint"]);
});

test("worker retains delivery failure across idle until an accepted batch", async () => {
  const { dependencies } = fixture();
  const gates = Array.from({ length: 4 }, () => Promise.withResolvers<void>());
  const entered = Array.from({ length: 4 }, () =>
    Promise.withResolvers<void>(),
  );
  let cycle = -1;
  const worker = startSupportWorker({
    ...dependencies,
    jobs: {
      ...dependencies.jobs,
      next: async () => {
        cycle += 1;
        const gate = gates[cycle];
        const entry = entered[cycle];
        if (!gate || !entry) throw new Error("Unexpected cycle");
        entry.resolve();
        await gate.promise;
        return null;
      },
    },
    reports: {
      ...dependencies.reports,
      recover: async () => (cycle === 1 ? [] : ["report"]),
    },
    email: {
      send: async () => {
        if (cycle === 0) throw new Error("SMTP");
        return "accepted" as const;
      },
    },
  });
  try {
    for (const index of [0, 1, 2]) {
      const gate = gates[index];
      const next = entered[index + 1];
      if (!gate || !next) throw new Error("Missing cycle barrier");
      gate.resolve();
      await next.promise;
      expect(worker.status()).toBe(index === 2 ? "ok" : "degraded");
    }
  } finally {
    const closing = worker.close();
    for (const gate of gates) gate.resolve();
    await closing;
  }
});
