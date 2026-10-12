import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { jwtVerify, SignJWT } from "jose";
import pino from "pino";
import { withHttpServer } from "./lib/server";

test("SvelteKit adapter produces a production server runnable by Bun", async () => {
  const entrypoint = new URL(
    "../../apps/fe-insta/dist/index.js",
    import.meta.url,
  );
  expect(await Bun.file(entrypoint).exists()).toBe(true);
  await withHttpServer({
    cwd: new URL("../../apps/fe-insta", import.meta.url).pathname,
    args: ["--preload", "./dist/observability-preload.js", "dist/index.js"],
    path: "/",
    environment: Object.fromEntries([
      ["API_BASE_URL", "http://127.0.0.1:1"],
      [
        "WEB_MONGO_URL",
        "mongodb://insta_web:synthetic@127.0.0.1/insta_web?authSource=insta_web&replicaSet=rs0",
      ],
      ["SESSION_ENCRYPTION_KEY", "a".repeat(64)],
      ["BFF_SOURCE_SIGNING_KEY", "c".repeat(64)],
    ]),
    assertResponse: async (response) => {
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("<title>Insta</title>");
      expect(html).toContain(
        "<h1>A little closer, one message at a time.</h1>",
      );
    },
  });
});

test.each(["__tests__/compatibility/server.ts"])(
  "Nest HTTP health runs under Bun: %s",
  async (entrypoint) => {
    await withHttpServer({
      cwd: new URL("../../apps/be-insta", import.meta.url).pathname,
      args: [entrypoint],
      path: "/health/ready",
      assertResponse: async (response) => {
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          ok: true,
          data: { status: "ok" },
        });
      },
    });
  },
);

test("Bun imports Boxed, signs/verifies jose JWT, and writes Pino JSON", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const token = await new SignJWT({ probe: "compatible" })
    .setProtectedHeader({ alg: "HS256" })
    .sign(key);
  const verified = await jwtVerify(token, key, { algorithms: ["HS256"] });
  expect(verified.payload.probe).toBe("compatible");
  expect(Result.Ok(verified.payload.probe).isOk()).toBe(true);
  const records: unknown[] = [];
  const logger = pino(
    { base: null, timestamp: false },
    {
      write: (line) => {
        records.push(JSON.parse(line));
      },
    },
  );
  logger.info({ probe: "compatible" }, "runtime smoke");
  expect(records).toEqual([
    { level: 30, probe: "compatible", msg: "runtime smoke" },
  ]);
});
