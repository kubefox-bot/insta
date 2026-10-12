import { expect, test } from "bun:test";
import { logFields } from "@insta/fe-core/observability/contracts";
import { createSupportHttpFixture } from "./fixture";

test("A23 necessary mode keeps real support HTTP completion while cookie/token/text/Mongo cause canaries stay out of Pino and response", async () => {
  const lines: string[] = [];
  const requestId = crypto.randomUUID();
  const f = await createSupportHttpFixture({
    save: async () => {
      throw new Error("CANARY_support_database", {
        cause: new Error("CANARY_support_cause"),
      });
    },
    observability: {
      mode: "runtime",
      level: "debug",
      flushTimeoutMs: 1000,
      destination: {
        write: (line) => {
          lines.push(line);
        },
      },
    },
  });
  try {
    const response = await fetch(
      `${f.url}/v1/support/reports?token=CANARY_query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
          cookie: "CANARY_cookie=necessary",
          authorization: "Bearer CANARY_access_token",
        },
        body: JSON.stringify({
          comment: "CANARY_private_report_text",
          errorCode: "TECHNICAL_PROBLEM",
          guestContext: "support-proof",
          originalRequestId: crypto.randomUUID(),
        }),
      },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(JSON.stringify(await response.json())).not.toContain("CANARY");
  } finally {
    await f.app.close();
  }
  const records: ReadonlyArray<Record<string, unknown>> = lines.map((line) =>
    JSON.parse(line),
  );
  const completed = records.filter(
    (row) => row[logFields.eventType] === "http_request",
  );
  expect(completed).toHaveLength(1);
  expect(completed[0]?.[logFields.requestId]).toBe(requestId);
  expect(completed[0]).toMatchObject({
    level: "error",
    http: { [logFields.statusCode]: 503 },
  });
  expect(lines.join("\n")).not.toContain("CANARY");
});
