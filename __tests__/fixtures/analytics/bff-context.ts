import { correlationSchema } from "@insta/contracts/http";
import { z } from "zod";
import { createSendBackend } from "../../../apps/fe-insta/src/domains/conversations/server/adapters/backend";
import { createConversationReads } from "../../../apps/fe-insta/src/domains/conversations/server/adapters/reads";
import { createSupportBackend } from "../../../apps/fe-insta/src/domains/support-reports/server/adapters/backend";
import { createApiService } from "../../../apps/fe-insta/src/lib/api/server/api-service";
import { readServerConfig } from "../../../apps/fe-insta/src/lib/config/server/index";
import { bffFixtureData } from "./lib/bff-response";

const receipts: {
  path: string;
  requestId: string | null;
  operationId: string | null;
  proof: string | null;
  foreignHeader: boolean;
}[] = [];
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    const requestId = request.headers.get("x-request-id");
    const operationId = request.headers.get("x-operation-id");
    const meta = { requestId, ...(operationId ? { operationId } : {}) };
    receipts.push({
      path,
      requestId,
      operationId,
      proof: request.headers.get("x-consent-context"),
      foreignHeader: [...request.headers.values()].includes(
        "never-export-context-extras",
      ),
    });
    const data = bffFixtureData(path);
    return Response.json(
      { ok: true, data, meta },
      { status: path === "/v1/support/reports" ? 202 : 200 },
    );
  },
});
try {
  const config = readServerConfig({
    raw: Object.fromEntries([
      ["API_BASE_URL", `http://127.0.0.1:${server.port}`],
      [
        "WEB_MONGO_URL",
        "mongodb://synthetic:synthetic@127.0.0.1:1/insta_web?authSource=insta_web&replicaSet=rs0",
      ],
      ["SESSION_ENCRYPTION_KEY", "a".repeat(64)],
      ["BFF_SOURCE_SIGNING_KEY", "b".repeat(64)],
    ]),
  });
  const cases = [];
  for (const proof of ["c".repeat(43), undefined]) {
    const requestId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const context = {
      requestId,
      operationId,
      ...(proof ? { consentProof: proof } : {}),
      authorizationCanary: "never-export-context-extras",
    };
    const source = async () => "owned-adapter-test-source";
    const send = await createSendBackend({ config, context, source })({
      accessToken: "synthetic-token",
      conversationId: "a".repeat(24),
      payload: { text: "synthetic" },
      key: "owned-key",
    });
    const created = await createConversationReads({
      config,
      context,
      source,
    }).start({ accessToken: "synthetic-token", recipientId: "recipient" });
    const support = createSupportBackend({ config, context, source });
    const form = await support.context();
    const saved = await support.submit({
      payload: { comment: "synthetic", errorCode: "TECHNICAL_PROBLEM" },
      key: "owned-key",
    });
    const generic = await createApiService(config.api).request({
      context,
      execute: ({ headers }) =>
        fetch(`${config.api.baseURL}/generic`, { headers }),
      outputSchema: z.strictObject({
        ok: z.literal(true),
        data: z.boolean(),
        meta: correlationSchema,
      }),
    });
    cases.push({
      withProof: Boolean(proof),
      success:
        send.isOk() &&
        created.isOk() &&
        form.ok &&
        saved.status === 202 &&
        generic.isOk(),
      receipts: receipts
        .splice(0)
        .map(
          ({
            path,
            requestId: receivedRequest,
            operationId: receivedOperation,
            proof: receivedProof,
            foreignHeader,
          }) => ({
            path,
            requestMatches: receivedRequest === requestId,
            operationMatches: receivedOperation === operationId,
            proofMatches: receivedProof === (proof ?? null),
            foreignHeader,
          }),
        ),
    });
  }
  console.log(JSON.stringify({ cases }));
} finally {
  await server.stop(true);
}
