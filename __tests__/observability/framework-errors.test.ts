import { expect, test } from "bun:test";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { repository } from "../architecture/fixtures/repository";
import { reservePort } from "../compatibility/lib/server";
import { waitUntil } from "../fixtures/barrier";

test("real built Kit console shares request correlation and excludes canary errors from stdout and stderr", async () => {
  using fixture = repository({});
  const frontend = resolve(import.meta.dir, "../../apps/fe-insta");
  for (const path of [
    "src",
    "config",
    "vite.config.ts",
    "package.json",
    "tsconfig.json",
  ])
    await cp(join(frontend, path), join(fixture.path, path), {
      recursive: true,
    });
  await mkdir(join(fixture.path, "node_modules"));
  for (const dependency of await readdir(join(frontend, "node_modules"))) {
    if (dependency.startsWith(".") && dependency !== ".bin") continue;
    await symlink(
      await realpath(join(frontend, "node_modules", dependency)),
      join(fixture.path, "node_modules", dependency),
      "dir",
    );
  }
  await mkdir(join(fixture.path, "src/routes/fnd05-error"), {
    recursive: true,
  });
  const preloadPath = join(
    fixture.path,
    "src/app/observability/server/preload.ts",
  );
  await writeFile(
    preloadPath,
    `${await readFile(preloadPath, "utf8")}\nconsole.warn("CANARY_outside_password");`,
  );
  await writeFile(
    join(fixture.path, "src/routes/fnd05-error/+server.ts"),
    'export const GET = () => { console.error("CANARY_native_password CANARY_token", new Error("CANARY_native_cause")); throw new Error("CANARY_password email@example.test CANARY_message", { cause: new Error("CANARY_cookie CANARY_token https://example.test/v?signature=CANARY_signed_url") }); };',
  );
  const built = Bun.spawn(
    [process.execPath, "--bun", "vite", "build", "--configLoader", "native"],
    {
      cwd: fixture.path,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30000,
    },
  );
  const [buildOutput, buildErrors, buildCode] = await Promise.all([
    new Response(built.stdout).text(),
    new Response(built.stderr).text(),
    built.exited,
  ]);
  expect(buildCode, buildOutput + buildErrors).toBe(0);
  const preload = Bun.spawn(
    [
      process.execPath,
      "build",
      "src/app/observability/server/preload.ts",
      "--outdir",
      "dist",
      "--entry-naming=observability-preload.[ext]",
      "--target",
      "bun",
      "--packages",
      "external",
    ],
    { cwd: fixture.path, stdout: "pipe", stderr: "pipe" },
  );
  const [preloadOut, preloadErr, preloadCode] = await Promise.all([
    new Response(preload.stdout).text(),
    new Response(preload.stderr).text(),
    preload.exited,
  ]);
  expect(preloadCode, preloadOut + preloadErr).toBe(0);
  const port = await reservePort();
  // The fixture error route does not acquire persistence. These synthetic
  // settings pass through the real validated configuration owner.
  const child = Bun.spawn(
    [
      process.execPath,
      "--preload",
      "./dist/observability-preload.js",
      "dist/index.js",
    ],
    {
      cwd: fixture.path,
      env: Object.fromEntries([
        ["HOST", "127.0.0.1"],
        ["PORT", String(port)],
        ["ORIGIN", "http://localhost"],
        ["API_BASE_URL", "http://127.0.0.1:1"],
        [
          "WEB_MONGO_URL",
          "mongodb://synthetic:synthetic@127.0.0.1:1/insta_web?authSource=insta_web&replicaSet=rs0",
        ],
        ["SESSION_ENCRYPTION_KEY", "a".repeat(64)],
        ["BFF_SOURCE_SIGNING_KEY", "c".repeat(64)],
        ["SHUTDOWN_TIMEOUT", "2"],
      ]),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20000,
    },
  );
  const output = new Response(child.stdout).text();
  const errors = new Response(child.stderr).text();
  const requestId = crypto.randomUUID();
  const operationId = crypto.randomUUID();
  let failure: unknown;
  try {
    await waitUntil({
      check: async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/`, {
            signal: AbortSignal.timeout(500),
          });
          await response.body?.cancel();
          return response.ok;
        } catch {
          return false;
        }
      },
      timeoutMs: 5000,
    });
    const response = await fetch(
      `http://127.0.0.1:${port}/fnd05-error?token=CANARY_query`,
      {
        headers: {
          "X-Request-ID": requestId,
          "X-Operation-ID": operationId,
          cookie: "CANARY_cookie",
          accept: "application/json",
        },
      },
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("CANARY");
  } catch (error) {
    failure = error;
  } finally {
    child.kill("SIGTERM");
    await child.exited;
  }
  const [stdout, stderr] = await Promise.all([output, errors]);
  expect(failure, stdout + stderr).toBeUndefined();
  expect(child.exitCode).toBe(0);
  expect(stdout + stderr).not.toContain("CANARY");
  const records: Record<string, unknown>[] = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  expect(
    records.filter(
      (record) =>
        record.event_type === "http_request" && record.request_id === requestId,
    ),
  ).toHaveLength(1);
  const completion = records.find(
    (record) =>
      record.event_type === "http_request" && record.request_id === requestId,
  );
  expect(completion?.operation_id).toBe(operationId);
  const nativeInside = records.filter(
    (record) => record.event_type === "system" && record.level === "error",
  );
  expect(nativeInside).toHaveLength(1);
  expect(nativeInside[0]?.request_id).toBe(requestId);
  expect(nativeInside[0]?.operation_id).toBe(operationId);
  const nativeOutside = records.filter(
    (record) => record.event_type === "system" && record.level === "warn",
  );
  expect(nativeOutside).toHaveLength(1);
  expect(nativeOutside[0]).not.toHaveProperty("request_id");
  expect(nativeOutside[0]).not.toHaveProperty("operation_id");
  expect(
    records.filter(
      (record) =>
        record.event_type === "exception" && record.request_id === requestId,
    ),
  ).toHaveLength(1);
}, 60000);
