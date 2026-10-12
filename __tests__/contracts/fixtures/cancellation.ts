import { commonErrorSchema, envelopeSchema } from "@insta/contracts/http";
import { z } from "zod";
import { createApiService } from "../../../apps/fe-insta/src/lib/api/server/api-service";

const branch = z.enum(["oversize", "html", "timeout"]).parse(process.argv[2]);
const cancellation = z.enum(["pending", "rejected"]).parse(process.argv[3]);
const timeoutMs =
  z.enum(["10", "10000"]).parse(process.argv[4]) === "10" ? 10 : 10000;
const body = new ReadableStream<Uint8Array>({
  start(controller) {
    if (branch === "oversize") controller.enqueue(new Uint8Array(17));
  },
  cancel() {
    if (cancellation === "rejected")
      return Promise.reject(new TypeError("cleanup failed"));
    return new Promise<void>(() => {});
  },
});
const status = branch === "html" ? 502 : 200;
const response = new Response(body, {
  status,
  headers: {
    "content-type": branch === "html" ? "text/html" : "application/json",
  },
});
const deadline = setTimeout(() => {
  process.stdout.write(
    JSON.stringify({ completed: false, locked: body.locked }),
  );
  process.exit(1);
}, 60);
try {
  const result = await createApiService({
    timeoutMs,
    maxResponseBytes: 16,
  }).request({
    execute: async () => response,
    outputSchema: envelopeSchema(z.null(), commonErrorSchema),
    context: {},
  });
  if (!result.isError()) throw new Error("Expected rejected response");
  clearTimeout(deadline);
  process.stdout.write(
    JSON.stringify({
      completed: true,
      error: result.getError(),
      locked: body.locked,
    }),
  );
} finally {
  clearTimeout(deadline);
}
// Natural subprocess exit proves no retained long reader deadline. No forced
// success exit or module mock hides pending cleanup or unhandled rejections.
