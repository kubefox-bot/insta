import { expect, it } from "bun:test";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { hookRepository } from "./lib/repository.ts";

const cli = resolve(
  import.meta.dir,
  "../../.lefthook/commit-msg/validate-commit.ts",
);
it("the CLI rejects missing and unreadable message files", () => {
  for (const args of [
    [],
    [join(import.meta.dir, "missing message.txt")],
    [import.meta.dir],
  ]) {
    const result = Bun.spawnSync([process.execPath, cli, ...args]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("commit message");
  }
});

it("reads only the first CRLF subject and accepts a path with spaces", async () => {
  using fixture = hookRepository();
  const message = join(fixture.path, "message with spaces.txt");
  writeFileSync(
    message,
    "fix(auth): preserve selected intent\r\n\r\nthis body is not a conventional subject\r\n",
  );
  const result = fixture.run(process.execPath, cli, message);
  expect(result.exitCode).toBe(0);
  writeFileSync(
    message,
    "\r\nfix: a valid body cannot supply a missing subject\r\n",
  );
  expect(fixture.run(process.execPath, cli, message).exitCode).toBe(1);
});

it("real installed hooks refuse a bad commit without moving HEAD and accept a valid subject/body", () => {
  using fixture = hookRepository();
  const checksum = join(fixture.path, ".git", "info", "lefthook.checksum");
  writeFileSync(checksum, "existing checksum survives commit hooks\n");
  expect(fixture.install().exitCode).toBe(0);
  expect(fixture.install().exitCode).toBe(0);
  expect(fixture.git("add", "payload.txt").exitCode).toBe(0);
  expect(
    fixture.git("commit", "-m", "test: create baseline commit").exitCode,
  ).toBe(0);
  const before = fixture.git("rev-parse", "HEAD").stdout.toString().trim();
  writeFileSync(join(fixture.path, "payload.txt"), "changed\n");
  fixture.git("add", "payload.txt");
  const rejected = fixture.git("commit", "-m", ": описание изменений");
  expect(rejected.exitCode).not.toBe(0);
  expect(rejected.stdout.toString() + rejected.stderr.toString()).toContain(
    "commit-type-missing",
  );
  expect(fixture.git("rev-parse", "HEAD").stdout.toString().trim()).toBe(
    before,
  );
  const message = join(fixture.path, "commit message.txt");
  writeFileSync(
    message,
    "fix(auth): preserve selected intent\r\n\r\ninvalid body is allowed\r\n",
  );
  const accepted = fixture.git("commit", "-F", message);
  expect(accepted.exitCode).toBe(0);
  expect(fixture.git("rev-parse", "HEAD").stdout.toString().trim()).not.toBe(
    before,
  );
  expect(fixture.git("log", "-1", "--format=%s").stdout.toString().trim()).toBe(
    "fix(auth): preserve selected intent",
  );
  expect(readFileSync(checksum, "utf8")).toBe(
    "existing checksum survives commit hooks\n",
  );
});

for (const gate of ["lint", "lint:boundaries", "typecheck"] as const) {
  it(`preserves ${gate} failure in pre-commit without bypass`, () => {
    using fixture = hookRepository();
    fixture.writeGates({ [gate]: 19 });
    expect(fixture.install().exitCode).toBe(0);
    fixture.git("add", "payload.txt");
    const result = fixture.git(
      "commit",
      "-m",
      "test: reject failed validation",
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.toString() + result.stderr.toString()).toContain(
      `fixture ${gate}`,
    );
    expect(fixture.git("rev-parse", "--verify", "HEAD").exitCode).not.toBe(0);
  });
}

for (const scenario of ["pre-commit", "commit-msg"] as const) {
  it(`repairs non-executable managed wrappers on reinstall and enforces ${scenario}`, () => {
    using fixture = hookRepository();
    expect(fixture.install().exitCode).toBe(0);
    for (const hook of ["pre-commit", "commit-msg"])
      chmodSync(join(fixture.path, ".git", "insta-hooks", hook), 0o644);
    fixture.writeGates(scenario === "pre-commit" ? { lint: 19 } : {});
    expect(fixture.install().exitCode).toBe(0);
    for (const hook of ["pre-commit", "commit-msg"])
      expect(
        statSync(join(fixture.path, ".git", "insta-hooks", hook)).mode & 0o777,
      ).toBe(0o755);
    expect(fixture.git("rev-parse", "--verify", "HEAD").exitCode).not.toBe(0);
    expect(fixture.git("add", "payload.txt").exitCode).toBe(0);
    const subject =
      scenario === "pre-commit"
        ? "test: reject failed validation"
        : ": описание изменений";
    const result = fixture.git("commit", "-m", subject);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.toString() + result.stderr.toString()).toContain(
      scenario === "pre-commit" ? "fixture lint" : "commit-type-missing",
    );
    expect(fixture.git("rev-parse", "--verify", "HEAD").exitCode).not.toBe(0);
  });
}

it("preserves existing active hooks and config instead of overwriting them", () => {
  using fixture = hookRepository();
  const hooks = join(fixture.path, "existing hooks");
  mkdirSync(hooks);
  const hook = join(hooks, "pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 23\n");
  chmodSync(hook, 0o755);
  fixture.git("config", "--worktree", "core.hooksPath", hooks);
  expect(fixture.install().exitCode).not.toBe(0);
  expect(
    fixture
      .git("config", "--worktree", "--get", "core.hooksPath")
      .stdout.toString()
      .trim(),
  ).toBe(hooks);
  expect(readFileSync(hook, "utf8")).toBe("#!/bin/sh\nexit 23\n");
});

it("keeps main-checkout hooks and common Git config unchanged in a linked worktree", () => {
  using fixture = hookRepository();
  fixture.git("add", "payload.txt");
  expect(
    fixture.git("commit", "-m", "test: create worktree baseline").exitCode,
  ).toBe(0);
  const linked = join(fixture.path, "linked worktree");
  expect(fixture.git("worktree", "add", "-b", "linked", linked).exitCode).toBe(
    0,
  );
  const hooks = join(fixture.path, ".git", "hooks", "pre-commit");
  writeFileSync(hooks, "#!/bin/sh\nexit 23\n");
  chmodSync(hooks, 0o755);
  const commonBefore = readFileSync(
    join(fixture.path, ".git", "config"),
    "utf8",
  );
  const result = Bun.spawnSync(
    [process.execPath, resolve(import.meta.dir, "../../.lefthook/install.ts")],
    { cwd: linked },
  );
  expect(result.exitCode).not.toBe(0);
  expect(readFileSync(hooks, "utf8")).toBe("#!/bin/sh\nexit 23\n");
  expect(readFileSync(join(fixture.path, ".git", "config"), "utf8")).toBe(
    commonBefore,
  );
});

it("keeps an explicitly configured hook directory even when it is empty", () => {
  using fixture = hookRepository();
  const hooks = join(fixture.path, "empty custom hooks");
  mkdirSync(hooks);
  fixture.git("config", "--worktree", "core.hooksPath", hooks);
  expect(fixture.install().exitCode).not.toBe(0);
  expect(
    fixture
      .git("config", "--worktree", "--get", "core.hooksPath")
      .stdout.toString()
      .trim(),
  ).toBe(hooks);
});

it("installs linked-worktree hooks without writing common config or main hooks", () => {
  using fixture = hookRepository();
  fixture.git("add", "payload.txt");
  expect(
    fixture.git("commit", "-m", "test: create worktree baseline").exitCode,
  ).toBe(0);
  const linked = join(fixture.path, "linked worktree");
  expect(fixture.git("worktree", "add", "-b", "linked", linked).exitCode).toBe(
    0,
  );
  for (const name of [".lefthook", "lefthook.yml"])
    cpSync(join(fixture.path, name), join(linked, name), { recursive: true });
  symlinkSync(join(fixture.path, "node_modules"), join(linked, "node_modules"));
  const commonBefore = readFileSync(
    join(fixture.path, ".git", "config"),
    "utf8",
  );
  const checksum = join(fixture.path, ".git", "info", "lefthook.checksum");
  writeFileSync(checksum, "existing main-checkout checksum\n");
  const mainBefore = fixture
    .git("rev-parse", "--git-path", "hooks")
    .stdout.toString()
    .trim();
  const result = Bun.spawnSync([process.execPath, ".lefthook/install.ts"], {
    cwd: linked,
  });
  expect(result.exitCode).toBe(0);
  expect(readFileSync(checksum, "utf8")).toBe(
    "existing main-checkout checksum\n",
  );
  expect(readFileSync(join(fixture.path, ".git", "config"), "utf8")).toBe(
    commonBefore,
  );
  expect(
    fixture.git("rev-parse", "--git-path", "hooks").stdout.toString().trim(),
  ).toBe(mainBefore);
  expect(
    fixture.git("config", "--local", "--get", "core.hooksPath").exitCode,
  ).toBe(1);
  expect(
    readFileSync(
      join(
        fixture.path,
        ".git",
        "worktrees",
        "linked-worktree",
        "insta-hooks",
        "commit-msg",
      ),
      "utf8",
    ),
  ).toContain('call_lefthook run "commit-msg" "$@"');
});

it("restores absent worktree hook configuration when Lefthook installation fails", () => {
  using fixture = hookRepository();
  const commonBefore = readFileSync(
    join(fixture.path, ".git", "config"),
    "utf8",
  );
  writeFileSync(join(fixture.path, "lefthook.yml"), "pre-commit: [\n");
  expect(fixture.install().exitCode).not.toBe(0);
  expect(
    fixture.git("config", "--worktree", "--get", "core.hooksPath").exitCode,
  ).toBe(1);
  expect(readFileSync(join(fixture.path, ".git", "config"), "utf8")).toBe(
    commonBefore,
  );
});

it("real generated wrappers fail closed when the Lefthook executable disappears", () => {
  using fixture = hookRepository();
  const lefthook = Bun.which("lefthook");
  const git = Bun.which("git");
  if (!lefthook || !git)
    throw new Error("Git and Lefthook are required for hook tests");
  const bin = join(fixture.path, "isolated bin");
  mkdirSync(bin);
  const relocated = join(bin, "lefthook");
  cpSync(lefthook, relocated);
  chmodSync(relocated, 0o755);
  symlinkSync(git, join(bin, "git"));
  for (const name of ["uname", "tr", "sed"])
    symlinkSync(`/usr/bin/${name}`, join(bin, name));
  const environment = Object.fromEntries([["PATH", bin]]);
  const installed = Bun.spawnSync([process.execPath, ".lefthook/install.ts"], {
    cwd: fixture.path,
    env: environment,
  });
  expect(installed.exitCode).toBe(0);
  unlinkSync(relocated);
  expect(fixture.git("add", "payload.txt").exitCode).toBe(0);
  const rejected = Bun.spawnSync(
    [git, "commit", "-m", "test: require installed hook executable"],
    {
      cwd: fixture.path,
      env: environment,
    },
  );
  expect(rejected.exitCode).not.toBe(0);
  expect(rejected.stdout.toString() + rejected.stderr.toString()).toContain(
    "Can't find lefthook in PATH",
  );
  expect(fixture.git("rev-parse", "--verify", "HEAD").exitCode).not.toBe(0);
});
