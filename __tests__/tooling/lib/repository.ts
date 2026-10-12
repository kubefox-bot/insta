import {
  cpSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

export const hookRepository = () => {
  const path = mkdtempSync(join(tmpdir(), "insta hooks "));
  try {
    const run = (...args: string[]) =>
      Bun.spawnSync(args, { cwd: path, stdout: "pipe", stderr: "pipe" });
    const git = (...args: string[]) => run("git", ...args);
    for (const args of [
      ["init", "--initial-branch=fixture"],
      ["config", "user.email", "fixture@example.invalid"],
      ["config", "user.name", "Hook Fixture"],
      ["config", "commit.gpgsign", "false"],
      ["config", "extensions.worktreeConfig", "true"],
    ]) {
      const result = git(...args);
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    }
    const gates = { lint: 0, "lint:boundaries": 0, typecheck: 0 };
    const writeGates = (failures: Readonly<Partial<typeof gates>> = {}) => {
      const scripts = Object.fromEntries(
        Object.entries({ ...gates, ...failures }).map(([name, exit]) => [
          name,
          `bun -e 'console.log("fixture ${name}"); process.exit(${exit})'`,
        ]),
      );
      writeFileSync(join(path, "package.json"), JSON.stringify({ scripts }));
    };
    writeGates();
    writeFileSync(join(path, "payload.txt"), "initial\n");
    symlinkSync(join(root, "node_modules"), join(path, "node_modules"));
    for (const source of ["lefthook.yml", ".lefthook"])
      cpSync(join(root, source), join(path, source), { recursive: true });
    return {
      path,
      run,
      git,
      writeGates,
      install: () => run(process.execPath, ".lefthook/install.ts"),
      [Symbol.dispose]: () => rmSync(path, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(path, { recursive: true, force: true });
    throw error;
  }
};
