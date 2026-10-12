import { expect, test } from "bun:test";
import { z } from "zod";
import {
  createCompose,
  requireSuccess,
} from "../../../scripts/infra/commands/compose";
import { OwnedProcesses } from "../../../scripts/infra/commands/processes";
import { docker } from "../../../scripts/infra/docker";
import { inspectProject } from "../../../scripts/infra/host/containers";
import { assertProjectOwnership } from "../../../scripts/infra/host/preflight";
import { readLifecycleConfig } from "../../../scripts/infra/verification/config";
import { readAcceptanceSource } from "../../../scripts/testing/stories/source";
import { waitUntil } from "../../fixtures/barrier";
import { withResource } from "../../fixtures/lifecycle/with-resource";

test("prepared applications start, degrade, recover and update independently without changing data or infrastructure", async () => {
  const config = readLifecycleConfig();
  const processes = new OwnedProcesses(new AbortController().signal);
  const compose = createCompose({ processes });
  const identity = crypto.randomUUID();
  const id = (service: string) => compose.capture(["ps", "-q", service]);
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        ["mongo", "dragonfly", "mailpit"].map(async (service) => [
          service,
          await id(service),
        ]),
      ),
    );
  const status = async (service: string, path: string) =>
    Number(
      await compose.capture([
        "exec",
        "-T",
        service,
        "bun",
        "-e",
        `console.log((await fetch('http://localhost:${service === "fe-insta" ? 3000 : 3001}${path}')).status)`,
      ]),
    );
  const ready = (service: string, path: string, expected: number) =>
    waitUntil({
      check: async () => {
        try {
          return (await status(service, path)) === expected;
        } catch {
          return false;
        }
      },
    });
  const persist = async (mode: string) =>
    compose.capture([
      "--profile",
      "test",
      "run",
      "--rm",
      "--no-deps",
      "--pull",
      "never",
      "testhost",
      "bun",
      "__tests__/integration/docker/persistence.ts",
      mode,
      identity,
    ]);
  const up = async (service: string, recreate = false) =>
    requireSuccess(
      await compose.run([
        "up",
        "-d",
        "--no-build",
        "--pull",
        "never",
        "--no-deps",
        ...(recreate ? ["--force-recreate"] : []),
        service,
      ]),
    );
  await withResource({
    start: async () => ({ dispose: () => processes.close() }),
    use: async () => {
      const source = await readAcceptanceSource();
      assertProjectOwnership(await inspectProject(processes));
      for (const image of Object.values(config.images)) {
        const actual = z
          .object({
            user: z.literal("bun"),
            labels: z.record(z.string(), z.string()),
          })
          .parse(
            JSON.parse(
              await docker(
                "image",
                "inspect",
                "--format",
                '{"user":{{json .Config.User}},"labels":{{json .Config.Labels}}}',
                image,
              ),
            ),
          );
        expect(actual.labels["insta.source-manifest"]).toBe(source.hash);
        expect(actual.labels["insta.source-tree"]).toMatch(/^[a-f0-9]{40}$/);
      }
      await withResource({
        start: async () => ({ dispose: () => persist("cleanup") }),
        use: async () => {
          for (const service of ["fe-insta", "be-insta"])
            requireSuccess(await compose.run(["stop", service]));
          const infrastructure = await snapshot();
          const saved = JSON.parse(await persist("seed"));
          expect(saved).toMatchObject({ api: 1, web: 1 });
          await up("be-insta");
          await ready("be-insta", "/health/ready", 200);
          expect(await id("fe-insta")).toBe("");
          const backend = await id("be-insta");
          requireSuccess(await compose.run(["stop", "be-insta"]));
          await up("fe-insta");
          await ready("fe-insta", "/api/health/live", 200);
          await ready("fe-insta", "/api/health/ready", 503);
          const frontend = await id("fe-insta");
          await up("be-insta");
          await ready("fe-insta", "/api/health/ready", 200);
          expect(await id("be-insta")).toBe(backend);
          expect(await id("fe-insta")).toBe(frontend);
          await up("be-insta", true);
          await ready("fe-insta", "/api/health/ready", 200);
          expect(await id("be-insta")).not.toBe(backend);
          expect(await id("fe-insta")).toBe(frontend);
          const updatedBackend = await id("be-insta");
          await up("fe-insta", true);
          await ready("fe-insta", "/api/health/ready", 200);
          expect(await id("fe-insta")).not.toBe(frontend);
          expect(await id("be-insta")).toBe(updatedBackend);
          expect(await snapshot()).toEqual(infrastructure);
          expect(JSON.parse(await persist("read"))).toEqual(saved);
          for (const [service, expected] of [
            ["fe-insta", config.images.frontend],
            ["be-insta", config.images.backend],
          ] as const) {
            expect(
              JSON.parse(
                await docker(
                  "inspect",
                  "--format",
                  '{"image":{{json .Image}},"mounts":{{json .Mounts}}}',
                  await id(service),
                ),
              ),
            ).toEqual({ image: expected, mounts: [] });
          }
        },
      });
    },
  });
}, 180000);
