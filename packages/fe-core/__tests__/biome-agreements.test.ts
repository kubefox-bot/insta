import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type Diagnostic = { category: string; severity: string };
const biome = resolve(
  import.meta.dir,
  "../../../node_modules/@biomejs/biome/bin/biome",
);
const preset = resolve(import.meta.dir, "../biome.json");

const diagnosticsFor = (source: string): Diagnostic[] => {
  const cwd = mkdtempSync(join(tmpdir(), "lints-biome-"));
  try {
    writeFileSync(
      join(cwd, "biome.json"),
      JSON.stringify({ extends: [preset] }),
    );
    writeFileSync(join(cwd, "source.ts"), source);
    const result = Bun.spawnSync(
      [process.execPath, biome, "lint", "--reporter=json", "source.ts"],
      {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const report = JSON.parse(result.stdout.toString()) as {
      diagnostics: Diagnostic[];
    };
    return report.diagnostics;
  } finally {
    rmSync(cwd, { force: true, recursive: true });
  }
};

const hasError = (source: string, rule: string): boolean =>
  diagnosticsFor(source).some(
    ({ category, severity }) => category === rule && severity === "error",
  );

describe("shared Biome agreements", () => {
  it("uses initialized function expressions while preserving required declarations", () => {
    expect(
      hasError(
        "export function greet() { return 'hello'; }",
        "lint/nursery/useConsistentFunctionStyle",
      ),
    ).toBe(true);
    expect(
      hasError(
        "export const greet = () => 'hello';",
        "lint/nursery/useConsistentFunctionStyle",
      ),
    ).toBe(false);
    expect(
      hasError(
        "function identity(value: string): string; function identity(value: number): number; function identity(value: string | number) { return value; } export { identity };",
        "lint/nursery/useConsistentFunctionStyle",
      ),
    ).toBe(false);
  });

  it("requires const and rejects var while allowing genuinely reassigned let", () => {
    expect(hasError("export let value = 1;", "lint/style/useConst")).toBe(true);
    expect(hasError("export var value = 1;", "lint/suspicious/noVar")).toBe(
      true,
    );
    expect(
      hasError("export let value = 1; value = 2;", "lint/style/useConst"),
    ).toBe(false);
  });

  it("rejects parameter rebinding without banning an explicit object mutation", () => {
    expect(
      hasError(
        "export const set = (input: number) => { input = 2; };",
        "lint/style/noParameterAssign",
      ),
    ).toBe(true);
    expect(
      hasError(
        "export const set = (input: { value: number }) => { input.value = 2; };",
        "lint/style/noParameterAssign",
      ),
    ).toBe(false);
  });

  it("marks stable private class fields readonly", () => {
    expect(
      hasError(
        "export class Store { private value = 1; }",
        "lint/style/useReadonlyClassProperties",
      ),
    ).toBe(true);
  });

  it("requires explicit switch variants and preserved error causes", () => {
    expect(
      hasError(
        'export const label = (value: "a" | "b") => { switch (value) { case "a": return 1; default: return 2; } };',
        "lint/nursery/useExhaustiveSwitchCases",
      ),
    ).toBe(true);
    expect(
      hasError(
        'export const label = (value: "a" | "b") => { switch (value) { case "a": return 1; case "b": return 2; } };',
        "lint/nursery/useExhaustiveSwitchCases",
      ),
    ).toBe(false);
    expect(
      hasError(
        'export const wrap = (run: () => void) => { try { run(); } catch (error) { throw new Error("failed"); } };',
        "lint/style/useErrorCause",
      ),
    ).toBe(true);
  });
});
