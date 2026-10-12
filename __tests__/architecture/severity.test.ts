import { expect, it } from "bun:test";
import { resolve } from "node:path";
import { repository } from "./fixtures/repository.ts";

const cli = resolve(import.meta.dir, "../../packages/fe-core/src/cli.ts");
it("advisory architecture exits 0 while a boundary violation exits 1", () => {
  using fixture = repository({
    "src/domains/users/browser/index.ts": "export const value = 1;",
    "src/domains/users/private.ts": "export const value = 1;",
    "src/app/index.svelte":
      '<script>import { value } from "../domains/users/private.ts"; const secret = Bun.env.SECRET;</script><p>fixture</p>',
    "lints.config.json": JSON.stringify({
      sourceRoot: "src",
      preset: "module-style",
      mode: "warn",
    }),
    "module-boundaries.config.json": JSON.stringify({
      sourceRoot: "src",
      layers: [
        { name: "domains", root: "src/domains", allow: [] },
        { name: "app", root: "src/app", allow: ["domains"] },
      ],
      moduleGroups: [
        {
          root: "src/domains",
          publicEntrypoints: ["browser/index.ts"],
          forbidCycles: true,
        },
      ],
    }),
  });
  const architecture = Bun.spawnSync(
    [process.execPath, cli, "architecture", "--config", "lints.config.json"],
    { cwd: fixture.path },
  );
  expect(architecture.exitCode).toBe(0);
  expect(architecture.stderr.toString()).toContain("environment-access");
  const boundaries = Bun.spawnSync(
    [
      process.execPath,
      cli,
      "module-boundaries",
      "--config",
      "module-boundaries.config.json",
    ],
    { cwd: fixture.path },
  );
  expect(boundaries.exitCode).toBe(1);
  expect(boundaries.stderr.toString()).toContain("private-module-import");
});
