import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { readAcceptanceSource } from "../../scripts/testing/stories/source";
import { withResource } from "../fixtures/lifecycle/with-resource";
import { readProcessEnvironment } from "./fixtures/frontend-liveness/config";

test("acceptance source manifest excludes deleted cached paths during a Git rename", async () => {
  const source = await readAcceptanceSource();
  expect(
    await Promise.all(
      source.entries.map(({ path }) => Bun.file(path).exists()),
    ),
  ).toEqual(source.entries.map(() => true));
});

const withDockerFixture = async ({
  owner,
  manifest,
  failSeed = false,
  failCleanup = false,
  use,
}: {
  readonly owner: string;
  readonly manifest?: string;
  readonly failSeed?: boolean;
  readonly failCleanup?: boolean;
  readonly use: (fixture: {
    readonly run: (
      args: readonly string[],
    ) => Promise<{ readonly code: number; readonly output: string }>;
    readonly commands: () => Promise<readonly (readonly string[])[]>;
    readonly effects: readonly string[];
  }) => Promise<void>;
}) =>
  withResource({
    start: async () => {
      const directory = await mkdtemp(`${tmpdir()}/insta-docker-ownership-`);
      const effects: string[] = [];
      const sink = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (request) => {
          effects.push(await request.text());
          return new Response("observed");
        },
      });
      await mkdir(`${directory}/bin`);
      const executable = `${directory}/bin/docker`;
      await writeFile(
        executable,
        `#!${process.execPath}\nimport ${JSON.stringify(resolve("__tests__/config/fixtures/docker-ownership/docker.ts"))};\n`,
      );
      await chmod(executable, 0o700);
      await writeFile(
        `${directory}/fixture.json`,
        JSON.stringify({
          owner,
          manifest: manifest ?? (await readAcceptanceSource()).hash,
          project: "insta-docker-ownership",
          sink: `http://127.0.0.1:${sink.port}`,
          failSeed,
          failCleanup,
        }),
      );
      await writeFile(`${directory}/commands.jsonl`, "");
      const inherited = readProcessEnvironment();
      const env = {
        ...inherited,
        ...Object.fromEntries([
          ["PATH", `${directory}/bin:${inherited.PATH}`],
          ["DOCKER_HOST", `unix://${directory}/fixture.sock`],
          ["COMPOSE_PROJECT_NAME", "insta-docker-ownership"],
          ["INSTA_VERIFY_FE_IMAGE", `sha256:${"a".repeat(64)}`],
          ["INSTA_VERIFY_BE_IMAGE", `sha256:${"b".repeat(64)}`],
          ["INSTA_VERIFY_TESTHOST_IMAGE", `sha256:${"c".repeat(64)}`],
          ["AUTH05_TESTHOST_IMAGE", `sha256:${"c".repeat(64)}`],
        ]),
      };
      return {
        effects,
        run: async (args: readonly string[]) => {
          const child = Bun.spawn([process.execPath, ...args], {
            env,
            stdout: "pipe",
            stderr: "pipe",
            timeout: 30000,
          });
          const [code, out, error] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]);
          return { code, output: out + error };
        },
        commands: async () =>
          (await Bun.file(`${directory}/commands.jsonl`).text())
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line)),
        dispose: async () => {
          await sink.stop(true);
          await rm(directory, { recursive: true, force: true });
        },
      };
    },
    use,
  });
const host = [
  "test",
  "__tests__/integration/docker/lifecycle.host.test.ts",
  "--timeout",
  "20000",
];
const browser = [
  "--bun",
  "node_modules/@playwright/test/cli.js",
  "test",
  "--config",
  "__tests__/e2e/playwright.config.ts",
  "--project=chrome",
  "__tests__/e2e/docker/lifecycle.spec.ts",
];
const writes = (commands: readonly (readonly string[])[]) =>
  commands.filter(
    (args) =>
      args.includes("compose") &&
      ["up", "stop", "run"].some((command) => args.includes(command)),
  );
for (const [owner, args] of [
  ["host", host],
  ["browser", browser],
] as const)
  test(`${owner} lifecycle rejects a borrowed checkout before Docker writes or persistence I/O`, async () => {
    await withDockerFixture({
      owner: "/borrowed-checkout",
      use: async (fixture) => {
        const result = await fixture.run(args);
        expect(result.code).not.toBe(0);
        expect(writes(await fixture.commands())).toEqual([]);
        expect(fixture.effects).toEqual([]);
        expect(result.output).toContain("another checkout");
      },
    });
  }, 30000);
test("host lifecycle rejects stale provenance without persistence cleanup", async () => {
  await withDockerFixture({
    owner: process.cwd(),
    manifest: "stale",
    use: async (fixture) => {
      const result = await fixture.run(host);
      expect(result.code).not.toBe(0);
      expect(writes(await fixture.commands())).toEqual([]);
      expect(fixture.effects).toEqual([]);
    },
  });
}, 30000);
test("host partial seed attempts owned cleanup and preserves the seed error when cleanup fails", async () => {
  await withDockerFixture({
    owner: process.cwd(),
    failSeed: true,
    failCleanup: true,
    use: async (fixture) => {
      const result = await fixture.run(host);
      expect(result.code).not.toBe(0);
      expect(fixture.effects).toEqual(["seed", "cleanup"]);
      expect(result.output).toContain("exit7");
      expect(result.output).toContain("exit9");
    },
  });
}, 30000);
