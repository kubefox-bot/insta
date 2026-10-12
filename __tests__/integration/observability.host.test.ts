import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { logFields } from "@insta/fe-core/observability/contracts";
import { readInfraConfig } from "../../scripts/infra/config";
import { cleanupResources } from "../../scripts/testing/cleanup";
import type { OwnedResource } from "../../scripts/testing/types";
import { waitUntil } from "../fixtures/barrier";
import { docker } from "../fixtures/docker";

test("isolated production Bun apps correlate HTTP across processes and exit gracefully on SIGTERM", async () => {
  const runId = `insta-fnd05-${crypto.randomUUID()}`;
  const resources: OwnedResource[] = [];
  const backend = `${runId}-be-insta`;
  const services = [
    { name: "be-insta", port: "3001/tcp", path: "/health/ready" },
    { name: "fe-insta", port: "3000/tcp", path: "/api/health/ready" },
  ] as const;
  const instances: ProductionInstance[] = [];
  const recordsByService = new Map<string, Record<string, unknown>[]>();
  const verify = async () => {
    for (const service of services) {
      const container = `${runId}-${service.name}`;
      const environment =
        service.name === "fe-insta"
          ? ["--env", `API_BASE_URL=http://${backend}:3001`]
          : [];
      const id = await docker(
        "compose",
        "--project-name",
        readInfraConfig().project,
        "run",
        "-d",
        "--no-deps",
        "--name",
        container,
        "--label",
        `insta.testRunId=${runId}`,
        "-p",
        `127.0.0.1::${service.port.split("/")[0]}`,
        ...environment,
        service.name,
      );
      resources.push({ kind: "container", id });
      const port = (await docker("port", id, service.port)).split(":").at(-1);
      const url = `http://127.0.0.1:${port}${service.path}`;
      await waitUntil({
        check: async () => {
          try {
            const response = await fetch(url, {
              signal: AbortSignal.timeout(1000),
            });
            await response.body?.cancel();
            return response.ok;
          } catch {
            return false;
          }
        },
      });
      const requestIds: string[] = [crypto.randomUUID(), crypto.randomUUID()];
      const operationId = crypto.randomUUID();
      instances.push({
        id,
        name: service.name,
        path: service.path,
        requestIds,
        operationId,
      });
      await Promise.all(
        requestIds.map(async (requestId) => {
          const response = await fetch(`${url}?token=CANARY_query`, {
            headers: {
              "x-request-id": requestId,
              "x-operation-id": operationId,
              cookie: "CANARY_cookie",
              authorization: "Bearer CANARY_token",
              traceparent:
                "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
            },
            signal: AbortSignal.timeout(10000),
          });
          expect(response.ok).toBe(true);
          expect(response.headers.get("x-request-id")).toBe(requestId);
          expect((await response.json()).meta.requestId).toBe(requestId);
        }),
      );
    }
    for (const instance of instances.reverse())
      recordsByService.set(instance.name, await stopAndReadInstance(instance));
    assertCrossProcessRecords({ instances, recordsByService });
  };
  const verified = await Result.fromPromise(verify());
  const disposed = await Result.fromPromise(
    cleanupResources({ testRunId: runId, resources, execute: docker }),
  );
  if (verified.isError()) {
    if (disposed.isError())
      throw new AggregateError(
        [verified.getError(), disposed.getError()],
        "Production verification and cleanup failed",
        { cause: verified.getError() },
      );
    throw verified.getError();
  }
  if (disposed.isError()) throw disposed.getError();
}, 60000);

type ProductionInstance = Readonly<{
  id: string;
  name: string;
  path: string;
  requestIds: readonly string[];
  operationId: string;
}>;
const stopAndReadInstance = async (instance: ProductionInstance) => {
  await docker("stop", "--time", "10", instance.id);
  expect(
    await docker("inspect", "--format", "{{.State.ExitCode}}", instance.id),
  ).toBe("0");
  const logs = await docker("logs", instance.id);
  expect(logs).not.toContain("CANARY");
  const records: Record<string, unknown>[] = logs
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  for (const requestId of instance.requestIds) {
    const completions = records.filter(
      (record) =>
        record.request_id === requestId && record.event_type === "http_request",
    );
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({
      [logFields.schemaVersion]: 2,
      [logFields.serviceName]: instance.name,
      [logFields.operationId]: instance.operationId,
      source: "server",
      level: "info",
      http: {
        method: "GET",
        route: instance.path,
        [logFields.statusCode]: 200,
      },
    });
    expect(completions[0]?.trace_id).toBeUndefined();
    expect(completions[0]?.span_id).toBeUndefined();
  }
  const logging = JSON.parse(
    await docker(
      "inspect",
      "--format",
      "{{json .HostConfig.LogConfig}}",
      instance.id,
    ),
  );
  expect(logging.Type).toBe("json-file");
  expect(logging.Config).toEqual({ "max-size": "10m", "max-file": "3" });

  return records;
};

const assertCrossProcessRecords = ({
  instances,
  recordsByService,
}: Readonly<{
  instances: readonly ProductionInstance[];
  recordsByService: ReadonlyMap<string, Record<string, unknown>[]>;
}>) => {
  const frontend = instances.find((instance) => instance.name === "fe-insta");
  if (!frontend) throw new Error("Frontend fixture missing");
  for (const requestId of frontend.requestIds) {
    const backendRecords = (recordsByService.get("be-insta") ?? []).filter(
      (record) =>
        record.request_id === requestId && record.event_type === "http_request",
    );
    expect(backendRecords).toHaveLength(1);
    expect(backendRecords[0]?.operation_id).toBe(frontend.operationId);
  }
};
