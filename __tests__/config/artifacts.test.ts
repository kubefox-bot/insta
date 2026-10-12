import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  secureDirectory,
  writePrivateFile,
} from "../../scripts/infra/artifacts";

test("owned runtime artifacts are private at creation, preserve content, and reject symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "insta-permissions-"));
  try {
    const directory = join(root, "private");
    await secureDirectory(directory);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    const path = join(directory, "secret");
    await writePrivateFile({ path, content: "synthetic" });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await chmod(path, 0o644);
    await writePrivateFile({ path, content: "must-not-overwrite" });
    expect(await Bun.file(path).text()).toBe("synthetic");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const link = join(root, "link");
    await symlink(path, link);
    await expect(
      writePrivateFile({
        path: link,
        content: "must-not-write",
        mode: "replace",
      }),
    ).rejects.toThrow();
    expect(await Bun.file(path).text()).toBe("synthetic");
    const directoryLink = join(root, "directory-link");
    await symlink(directory, directoryLink);
    await expect(secureDirectory(directoryLink)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
