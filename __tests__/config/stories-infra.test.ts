import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readCommandEnvironment } from "../../scripts/infra/config";

test("prepared Stories profile isolates secrets from frontend and preserves disabled Core", async () => {
  const dir = await mkdtemp(join(tmpdir(), "insta-stories-profile-"));
  try {
    await mkdir(join(dir, "infra/traefik"), { recursive: true });
    await mkdir(join(dir, "infra/certs"), { recursive: true });
    for (const file of ["dynamic.yml", "stories.yml"])
      await Bun.write(
        join(dir, "infra/traefik", file),
        await Bun.file(`infra/traefik/${file}`).text(),
      );
    await Bun.write(
      join(dir, "infra/certs/localhost.crt"),
      "fixture certificate",
    );
    const digest = `sha256:${"a".repeat(64)}`;
    const child = Bun.spawn(
      [
        "bun",
        resolve("scripts/infra/stories/prepare.ts"),
        `--fe=${digest}`,
        `--be=${digest}`,
        `--testhost=${digest}`,
      ],
      {
        cwd: dir,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...readCommandEnvironment(),
          ...Object.fromEntries([
            ["STORIES_MAX_DURATION_MS", "10000"],
            ["STORIES_LIFETIME_MS", "3000000000"],
          ]),
        },
      },
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    const enabled = await Bun.file(
      join(dir, ".infra/stories-compose.json"),
    ).json();
    const disabled = await Bun.file(
      join(dir, ".infra/stories-core-compose.json"),
    ).json();
    expect(enabled.services["fe-insta"].environment).toEqual(
      Object.fromEntries([["STORIES_MODE", "enabled"]]),
    );
    expect(
      enabled.services["be-insta"].environment.STORIES_STORAGE_PROFILES,
    ).toContain("secretAccessKey");
    expect(stdout).not.toContain("secretAccessKey");
    for (const service of ["be-insta", "testhost"]) {
      expect(
        enabled.services[service].environment.STORIES_MAX_DURATION_MS,
      ).toBe("10000");
      expect(enabled.services[service].environment.STORIES_LIFETIME_MS).toBe(
        "3000000000",
      );
    }
    expect(disabled.services["be-insta"].environment).toEqual(
      Object.fromEntries([["STORIES_MODE", "disabled"]]),
    );
    expect(disabled.services.rustfs).toBeUndefined();
    expect((await stat(join(dir, ".infra"))).mode & 0o777).toBe(0o700);
    expect(
      (await stat(join(dir, ".infra/stories-compose.json"))).mode & 0o777,
    ).toBe(0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
