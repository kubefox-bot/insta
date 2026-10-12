import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRepositoryFiles } from "../../../api-boundaries/project";
import { readRepositoryPaths } from "../../../architecture/project";
import { listRepositoryPaths } from "../index";

test("Git enumeration preserves raw paths and scanners retain their file sets", () => {
  const cwd = mkdtempSync(join(tmpdir(), "insta-paths-"));
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd });
    expect(result.exitCode).toBe(0);
  };
  try {
    git("init", "-q");
    for (const name of [
      "tracked.ts",
      "deleted.ts",
      "юникод.ts",
      "line\nbreak.ts",
      "document.md",
    ])
      writeFileSync(join(cwd, name), "");
    git("add", ".");
    unlinkSync(join(cwd, "deleted.ts"));
    writeFileSync(join(cwd, ".gitignore"), "ignored.ts\n");
    writeFileSync(join(cwd, "ignored.ts"), "");
    writeFileSync(join(cwd, "untracked.ts"), "");
    expect([...listRepositoryPaths({ cwd })].sort()).toEqual(
      [
        ".gitignore",
        "deleted.ts",
        "document.md",
        "line\nbreak.ts",
        "tracked.ts",
        "untracked.ts",
        "юникод.ts",
      ].sort(),
    );
    expect(readRepositoryPaths(cwd)).toEqual(
      [
        ".gitignore",
        "document.md",
        "line\nbreak.ts",
        "tracked.ts",
        "untracked.ts",
        "юникод.ts",
      ].sort(),
    );
    expect(readRepositoryFiles(cwd).map(({ path }) => path)).toEqual(
      ["line\nbreak.ts", "tracked.ts", "untracked.ts", "юникод.ts"].sort(),
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("Git subprocess failure remains an error with stderr", () => {
  const cwd = mkdtempSync(join(tmpdir(), "insta-non-repository-"));
  try {
    expect(() => listRepositoryPaths({ cwd })).toThrow("not a git repository");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
