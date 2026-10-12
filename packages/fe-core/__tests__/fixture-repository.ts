import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FixtureRepository = {
  path: string;
  [Symbol.dispose](): void;
};

export const createFixtureRepository = (
  files: Record<string, string>,
): FixtureRepository => {
  const path = mkdtempSync(join(tmpdir(), "insta-lints-"));
  const fixtureFiles = {
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
        },
        include: ["src/**/*.ts", "src/**/*.tsx"],
      },
      undefined,
      2,
    ),
    ...files,
  };

  execFileSync("git", ["init"], { cwd: path, stdio: "ignore" });

  for (const [relativePath, content] of Object.entries(fixtureFiles)) {
    const filePath = join(path, relativePath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content, { encoding: "utf8", flush: true });
  }

  return {
    path,
    [Symbol.dispose]() {
      rmSync(path, { force: true, recursive: true });
    },
  };
};
