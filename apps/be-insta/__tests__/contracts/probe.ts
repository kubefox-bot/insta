import { mock } from "bun:test";

mock.module("$app/server", () => ({}));

import { z } from "zod";
import { createApplication } from "../../src/app/bootstrap";

const { getHealthReady } = await import(
  "../../../fe-insta/src/lib/api/generated/clients/getHealthReady"
);

import {
  getHealthReady200Schema,
  getHealthReady500Schema,
} from "../../../fe-insta/src/lib/api/generated/schemas/getHealthReadySchema";

const { createTransport } = await import(
  "../../../fe-insta/src/lib/api/server/transport.server"
);

import { createApiService } from "../../../fe-insta/src/lib/api/server/api-service";
import { validateApiConfiguration } from "../../../fe-insta/src/lib/config/read.server";

const configuration = { timeoutMs: 100, maxResponseBytes: 1024 };
const meta = {
  requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9",
  operationId: "8d96fdc6-021a-4b44-bb44-123b4df7f53a",
};
const app = await createApplication({
  checkRequired: async () => true,
  check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
  close: async () => {},
});
await app.listen(0, "127.0.0.1");
const client = createTransport(
  validateApiConfiguration({ baseURL: await app.getUrl() }),
);
const service = createApiService(configuration);
let calls = 0;
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: (request) => {
    calls++;
    const path = new URL(request.url).pathname;
    if (path === "/size")
      return Response.json({
        ok: true,
        data: { status: "ok", extra: "x".repeat(1025) },
        meta,
      });
    if (path === "/slow")
      return new Promise<Response>((resolve) =>
        setTimeout(
          () =>
            resolve(Response.json({ ok: true, data: { status: "ok" }, meta })),
          300,
        ),
      );
    return Response.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "safe" }, meta },
      { status: 500 },
    );
  },
});
try {
  const response = await getHealthReady({
    client,
    headers: {
      "X-Request-ID": meta.requestId,
      "X-Operation-ID": meta.operationId,
    },
  });
  const body = await response.json();
  const outputSchema = z.discriminatedUnion("ok", [
    getHealthReady200Schema,
    getHealthReady500Schema,
  ]);
  const badClient = createTransport({
    ...configuration,
    baseURL: server.url.toString(),
  });
  const failure = await service.request({
    execute: (options) => getHealthReady({ ...options, client: badClient }),
    outputSchema,
    context: meta,
  });
  const size = await service.request({
    execute: () => badClient({ url: "/size" }),
    outputSchema,
    context: meta,
  });
  const slow = await service.request({
    execute: () => badClient({ url: "/slow" }),
    outputSchema,
    context: meta,
  });
  console.log(
    JSON.stringify({
      health: outputSchema.safeParse(body).success,
      correlation:
        body.meta.requestId === meta.requestId &&
        body.meta.operationId === meta.operationId,
      noRetries: calls === 3 && failure.isError(),
      boundedBody:
        size.isError() && size.getError().kind === "invalid_contract",
      timeout: slow.isError() && slow.getError().kind === "network",
    }),
  );
} finally {
  await app.close();
  await server.stop(true);
}
