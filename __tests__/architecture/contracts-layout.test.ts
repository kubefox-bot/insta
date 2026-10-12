import { expect, it } from "bun:test";
import { runArchitectureCheck } from "@insta/fe-core/lints";
import { repository } from "./fixtures/repository.ts";

for (const name of [
  "types.ts",
  "contract.types.ts",
  "props.ts",
  "ports/storage/interfaces.ts",
]) {
  it(`accepts type-only ${name}`, async () => {
    using fixture = repository({
      [`src/${name}`]:
        'import type { Readable } from "svelte/store"; export type Input = Readonly<{ state: Readable<string> }>;',
    });
    expect(
      (
        await runArchitectureCheck(
          { sourceRoot: "src", preset: "module-style" },
          { cwd: fixture.path },
        )
      ).findings,
    ).toEqual([]);
  });
  for (const source of [
    'import "node:fs"; export type Input = string;',
    "export const value = Date.now();",
  ]) {
    it(`rejects runtime ${name}: ${source}`, async () => {
      using fixture = repository({ [`src/${name}`]: source });
      expect(
        (
          await runArchitectureCheck(
            { sourceRoot: "src", preset: "module-style" },
            { cwd: fixture.path },
          )
        ).findings.map((value) => value.rule),
      ).toContain("types-file-purity");
    });
  }
}
for (const source of [
  'export const timeoutMs = 2000; export const modes = { necessary: "necessary" } as const;',
  "const tick = 1000; export const timeoutMs = tick;",
]) {
  it("accepts static named conts", async () => {
    using fixture = repository({ "src/conts.ts": source });
    expect(
      (
        await runArchitectureCheck(
          { sourceRoot: "src", preset: "module-style" },
          { cwd: fixture.path },
        )
      ).findings,
    ).toEqual([]);
  });
}
for (const source of [
  "export const read = () => 1;",
  'import "node:fs";',
  'export const result = Bun.file("data");',
  "export const value = process.env.SECRET;",
  "export let timeoutMs = 2000;",
]) {
  it(`rejects nonstatic conts: ${source}`, async () => {
    using fixture = repository({ "src/conts.ts": source });
    expect(
      (
        await runArchitectureCheck(
          { sourceRoot: "src", preset: "module-style", mode: "warn" },
          { cwd: fixture.path },
        )
      ).findings.map((value) => value.rule),
    ).toContain("conts-file-purity");
  });
}
it("checks own barrels and raw env in both Svelte scripts without banning index.svelte", async () => {
  using fixture = repository({
    "src/components/Player/index.ts": 'export { value } from "./value.ts";',
    "src/components/Player/value.ts": "export const value = 1;",
    "src/components/Player/index.svelte":
      '<script module>import { value } from "./index.ts";</script><script>const token = Bun.env.SECRET;</script><p>fixture</p>',
  });
  const result = await runArchitectureCheck(
    { sourceRoot: "src", preset: "module-style", mode: "warn" },
    { cwd: fixture.path },
  );
  expect(result.mode).toBe("warn");
  expect(result.findings.map((value) => value.rule)).toContain(
    "own-barrel-import",
  );
  expect(result.findings.map((value) => value.rule)).toContain(
    "environment-access",
  );
  expect(result.findings.map((value) => value.rule)).not.toContain(
    "index-boundary",
  );
});
