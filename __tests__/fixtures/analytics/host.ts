import { expect } from "@playwright/test";
import { safeFaroBodySchema } from "../../../apps/fe-insta/src/lib/observability/client/index";
import { createTelemetryReceiver } from "../../../infra/otel/receiver";

const receiveSdkBody = async ({
  request,
  receiver,
  bodyKinds,
}: Readonly<{
  request: Request;
  receiver: ReturnType<typeof createTelemetryReceiver>;
  bodyKinds: string[];
}>) => {
  const payload = await request.json();
  expect(JSON.stringify(payload)).not.toContain("CANARY");
  const safe = safeFaroBodySchema.parse(payload.body);
  bodyKinds.push(safe.exceptions?.length ? "exception" : "measurement");
  return receiver(
    new Request(new URL("/collect", request.url), {
      method: "POST",
      body: JSON.stringify(safe),
    }),
  );
};
export const createAnalyticsBrowserHost = async () => {
  const built = await Bun.build({
    entrypoints: ["__tests__/fixtures/analytics/browser.ts"],
    target: "browser",
  });
  if (!built.success) throw new Error("Analytics browser fixture build failed");
  const output = built.outputs[0];
  if (!output) throw new Error("Missing analytics fixture");
  const receiver = createTelemetryReceiver();
  const bodyKinds: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/bundle.js")
        return new Response(output, {
          headers: { "Content-Type": "application/javascript" },
        });
      if (path === "/api/telemetry/faro") {
        if (request.method === "GET")
          return Response.json({
            enabled: true,
            revision: 1,
            policyVersion: 1,
          });
        return receiveSdkBody({ request, receiver, bodyKinds });
      }
      if (path === "/receipts") return receiver(request);
      return new Response(
        '<!doctype html><html><body>SDK fixture<script src="/bundle.js"></script></body></html>',
        { headers: { "Content-Type": "text/html" } },
      );
    },
  });
  return {
    server,
    bodyKinds,
    receipts: async () =>
      (await (await fetch(`http://127.0.0.1:${server.port}/receipts`)).json())
        .receipts,
  };
};
