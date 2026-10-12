import { expect, test } from "bun:test";
import { logFields } from "@insta/fe-core/observability/contracts";
import { readContext } from "@insta/fe-core/observability/server";
import { PinoLogger } from "nestjs-pino";
import { createApplication } from "../../src/app/bootstrap";
import { readCorrelation } from "../../src/lib/http/index";

test("real Bun Nest12/Pino HTTP requests isolate IDs and own one safe completion each", async () => {
  const lines: string[] = [];
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const ids: string[] = [
    crypto.randomUUID().toUpperCase(),
    crypto.randomUUID(),
  ];
  let arrivals = 0;
  const failureId = crypto.randomUUID();
  const contexts: ReturnType<typeof readContext>[] = [];
  const app = await createApplication(
    {
      checkRequired: async () => true,
      check: async () => {
        arrivals++;
        if (arrivals > 2)
          throw new Error("CANARY_framework_password_email@example.test", {
            cause: new Error("CANARY_framework_cookie"),
          });
        const before = readContext();
        (await app.resolve(PinoLogger)).error(
          {
            err: new Error("CANARY_password_email@example.test"),
            nested: { token: "CANARY_token" },
          },
          "CANARY_message",
        );
        if (arrivals === 2) arrived.resolve();
        await release.promise;
        contexts.push(readContext());
        expect(readContext()).toEqual(before);
        return { ready: true, mail: "ok", delivery: "ok" };
      },
      close: async () => {},
    },
    {
      mode: "runtime",
      level: "debug",
      flushTimeoutMs: 1000,
      destination: {
        write: (line) => {
          lines.push(line);
        },
      },
    },
  );
  app
    .getHttpAdapter()
    .get(
      "/headers",
      (
        request: { headers: Readonly<Record<string, unknown>> },
        response: { json: (value: unknown) => void },
      ) =>
        response.json({
          meta: readCorrelation(request.headers),
          untouched: request.headers["x-request-id"] === undefined,
        }),
    );
  try {
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string")
      throw new Error("Expected TCP listener");
    const requests = ids.map((id) =>
      fetch(
        `http://127.0.0.1:${address.port}/health/ready?token=CANARY_query`,
        {
          headers: {
            "x-request-id": id,
            cookie: "CANARY_cookie",
            traceparent:
              "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
          },
        },
      ).then(async (response) => {
        expect(response.headers.get("x-request-id")).toBe(id);
        expect((await response.json()).meta.requestId).toBe(id);
      }),
    );
    await arrived.promise;
    release.resolve();
    await Promise.all(requests);
    const headerProbe = await fetch(`http://127.0.0.1:${address.port}/headers`);
    const headerBody = await headerProbe.json();
    expect(headerBody.untouched).toBe(true);
    expect(headerBody.meta.requestId).toBe(
      headerProbe.headers.get("x-request-id"),
    );
    const failed = await fetch(
      `http://127.0.0.1:${address.port}/health/ready`,
      { headers: { "x-request-id": failureId } },
    );
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("CANARY");
    const generatedFailure = await fetch(
      `http://127.0.0.1:${address.port}/health/ready`,
    );
    expect(generatedFailure.status).toBe(500);
    expect((await generatedFailure.json()).meta.requestId).toBe(
      generatedFailure.headers.get("x-request-id"),
    );
  } finally {
    release.resolve();
    await app.close();
  }
  const records: Record<string, unknown>[] = lines.map((line) =>
    JSON.parse(line),
  );
  const completions = records.filter(
    (record) => record.event_type === "http_request",
  );
  expect(completions).toHaveLength(5);
  expect(
    completions.filter((record) => record.request_id === failureId),
  ).toHaveLength(1);
  for (const id of ids) {
    const forId = completions.filter((record) => record.request_id === id);
    expect(forId).toHaveLength(1);
    expect(forId.every((record) => record.request_id === id)).toBe(true);
    expect(forId[0]).toMatchObject({
      level: "info",
      [logFields.schemaVersion]: 2,
      [logFields.serviceName]: "be-insta",
      source: "server",
      http: {
        method: "GET",
        route: "/health/ready",
        [logFields.statusCode]: 200,
      },
    });
  }
  expect(
    contexts.every(
      (value) => ids.includes(value?.requestId ?? "") && !value?.traceId,
    ),
  ).toBe(true);
  expect(lines.join("")).not.toContain("CANARY");
  expect(readContext()).toBeUndefined();
});
