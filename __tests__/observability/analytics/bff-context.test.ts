import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { z } from "zod";
import { repository } from "../../architecture/fixtures/repository";

test("actual BFF HTTP adapters forward only owned request context and preserve no-proof business responses", async () => {
  using fixture = repository({});
  const compiled = await Bun.build({
    entrypoints: [
      resolve(import.meta.dir, "../../fixtures/analytics/bff-context.ts"),
    ],
    target: "bun",
    outdir: fixture.path,
    naming: "probe.js",
    plugins: [
      {
        name: "server-framework-marker",
        setup(build) {
          // SvelteKit's server-only marker has no runtime exports. The subprocess remains
          // a server; actual HTTP adapters, validation, serialization and I/O are retained.
          build.onResolve({ filter: /^\$app\/server$/ }, () => ({
            path: "marker",
            namespace: "server-framework-marker",
          }));
          build.onLoad(
            { filter: /.*/, namespace: "server-framework-marker" },
            () => ({ contents: "export {};", loader: "js" }),
          );
        },
      },
    ],
  });
  expect(compiled.success, compiled.logs.join("\n")).toBe(true);
  const child = Bun.spawn([process.execPath, join(fixture.path, "probe.js")], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10000,
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, err).toBe(0);
  const output = z
    .strictObject({
      cases: z.array(
        z.strictObject({
          withProof: z.boolean(),
          success: z.boolean(),
          receipts: z.array(
            z.strictObject({
              path: z.string(),
              requestMatches: z.boolean(),
              operationMatches: z.boolean(),
              proofMatches: z.boolean(),
              foreignHeader: z.boolean(),
            }),
          ),
        }),
      ),
    })
    .parse(JSON.parse(out));
  expect(output.cases).toHaveLength(2);
  for (const result of output.cases) {
    expect(result.success).toBe(true);
    expect(result.receipts).toHaveLength(5);
    for (const receipt of result.receipts) {
      expect(receipt.requestMatches, receipt.path).toBe(true);
      expect(receipt.operationMatches, receipt.path).toBe(true);
      expect(receipt.proofMatches, receipt.path).toBe(true);
      expect(receipt.foreignHeader, receipt.path).toBe(false);
    }
  }
}, 30000);
