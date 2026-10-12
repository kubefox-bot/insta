import { expect, test } from "bun:test";
import { startAuthFixture } from "../../fixtures/auth05/browser";
import { readAuthFixtureConfig } from "../../fixtures/auth05/config";
import { disposeAuthFixture } from "../../fixtures/auth05/dispose";

const credentials = {
  account: { email: "one@example.test", password: "synthetic" },
  secondAccount: { email: "two@example.test", password: "synthetic" },
  signupEmail: "signup@example.test",
  noJsEmail: "nojs@example.test",
};
const verifyOverlay = async (args: readonly string[]) => {
  const overlay = args[args.lastIndexOf("-f") + 1];
  if (!overlay) throw new Error("Missing current testhost overlay");
  const configuration = await Bun.file(overlay).json();
  const mounts: string[] = configuration.services.testhost.volumes;
  expect(mounts.every((mount) => mount.endsWith(":ro"))).toBe(true);
  expect(mounts.some((mount) => mount.includes("/node_modules"))).toBe(false);
  expect(
    mounts.some((mount) => mount.includes("bun.lock:/workspace/bun.lock:ro")),
  ).toBe(true);
  expect(args[args.indexOf("--pull") + 1]).toBe("never");
};

for (const phase of ["compose", "port", "credentials", "stop"]) {
  test(`auth fixture releases labelled container after ${phase} failure`, async () => {
    const effects: string[] = [];
    const configuration = { ...readAuthFixtureConfig(), image: undefined };
    let runId = "";
    const commands: Readonly<
      Record<string, (args: readonly string[]) => Promise<string>>
    > = {
      compose: async (args) => {
        runId = args[args.indexOf("--name") + 1] ?? "";
        await verifyOverlay(args);
        if (phase === "compose") throw new Error("Synthetic compose failure");
        return runId;
      },
      port: async () => {
        if (phase === "port") throw new Error("Synthetic port failure");
        return "127.0.0.1:12345";
      },
      stop: async () => {
        if (phase === "stop") throw new Error("Synthetic stop failure");
        return runId;
      },
    };
    const execute = async (...args: string[]) => {
      effects.push(args.join(" "));
      const command = commands[args[0] ?? ""];
      if (command) return command(args);
      return args.includes("{{.State.ExitCode}}") ? "0" : runId;
    };
    if (phase !== "stop") {
      await expect(
        startAuthFixture({
          configuration,
          execute,
          request: async () => Response.json({}),
        }),
      ).rejects.toThrow();
    } else {
      const fixture = await startAuthFixture({
        configuration,
        execute,
        request: async (_input, init) => {
          expect(init?.signal).toBeInstanceOf(AbortSignal);
          return Response.json(credentials);
        },
      });
      await expect(fixture.dispose()).rejects.toThrow();
    }
    expect(
      effects.some((effect) => effect.startsWith("container inspect")),
    ).toBe(true);
    expect(effects.some((effect) => effect.startsWith("container rm"))).toBe(
      true,
    );
  });
}

for (const label of ["insta-auth05-ddeeff", ""]) {
  test(`auth fixture does not stop a container with ${label ? "foreign" : "missing"} label`, async () => {
    const effects: string[] = [];
    await expect(
      disposeAuthFixture({
        runId: "insta-auth05-aabbcc",
        execute: async (...args) => {
          effects.push(args.join(" "));
          return label;
        },
      }),
    ).rejects.toThrow("Refusing stop of unowned auth fixture");
    expect(effects).toHaveLength(1);
    expect(effects[0]).toStartWith("container inspect");
  });
}

test("immutable auth fixture retains exact image without source/dependency mounts", async () => {
  const config = (
    await import("../../fixtures/auth05/config")
  ).readAuthFixtureConfig();
  const image = `sha256:${"a".repeat(64)}`;
  let runId = "";
  const fixture = await startAuthFixture({
    configuration: {
      ...config,
      image,
      hostMailpitUrl: "http://127.0.0.1:28025",
    },
    execute: async (...args) => {
      if (args[0] === "compose") {
        runId = args[args.indexOf("--name") + 1] ?? "";
        const overlay = args[args.lastIndexOf("-f") + 1];
        if (!overlay) throw new Error("Missing overlay");
        const generated = await Bun.file(overlay).json();
        expect(generated.services.testhost.image).toBe(image);
        expect(generated.services.testhost.volumes).toEqual([]);
      }
      if (args[0] === "port") return "127.0.0.1:12345";
      return args.includes("{{.State.ExitCode}}") ? "0" : runId;
    },
    request: async () => Response.json(credentials),
  });
  expect(fixture.hostMailpitUrl).toBe("http://127.0.0.1:28025");
  await fixture.dispose();
});

test("auth fixture validates the host Mailpit port independently of container Mailpit URL", () => {
  expect(
    readAuthFixtureConfig(
      Object.fromEntries([
        ["MAILPIT_PORT", "28025"],
        ["MAILPIT_URL", "http://mailpit:8025"],
      ]),
    ).hostMailpitUrl,
  ).toBe("http://127.0.0.1:28025");
  expect(
    readAuthFixtureConfig(Object.fromEntries([["MAILPIT_PORT", ""]]))
      .hostMailpitUrl,
  ).toBe(readAuthFixtureConfig({}).hostMailpitUrl);
  for (const port of ["invalid", "0", "65536", "12.5"])
    expect(() =>
      readAuthFixtureConfig(Object.fromEntries([["MAILPIT_PORT", port]])),
    ).toThrow();
});
