import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const repository = (files: Readonly<Record<string, string>>) => {
  const path = mkdtempSync(join(tmpdir(), "insta-architecture-"));
  execFileSync("git", ["init"], { cwd: path, stdio: "ignore" });
  const sources = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        paths: { "$domains/*": ["./src/domains/*"] },
      },
      include: ["src"],
    }),
    ...files,
  };
  for (const [name, text] of Object.entries(sources)) {
    const target = join(path, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  return {
    path,
    [Symbol.dispose]: () => rmSync(path, { recursive: true, force: true }),
  };
};
