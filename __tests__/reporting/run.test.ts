import { expect, test } from "bun:test";
import { createProviderTargets } from "../../scripts/testing/phases/providers";
import { runPhases } from "../../scripts/testing/phases/run";

test("a failed phase does not hide later phases; retry retains original failure and flake", async () => {
  const seen: string[] = [];
  const phases = [
    {
      name: "integration",
      paths: ["owned.test.ts"],
      commands: [["fail-once"]],
    },
    { name: "abuse", paths: ["other.test.ts"], commands: [["pass"]] },
  ];
  const result = await runPhases({
    targets: phases,
    retry: 1,
    execute: async (command) => {
      seen.push(command[0] ?? "");
      return {
        code: seen.length === 1 ? 1 : 0,
        evidence: `private-${seen.length}.log`,
      };
    },
  });
  expect(seen).toEqual(["fail-once", "fail-once", "pass"]);
  expect(result[0]).toMatchObject({
    result: "pass",
    flake: true,
    attempts: [{ code: 1 }, { code: 0 }],
  });
  expect(result[1]).toMatchObject({ result: "pass", flake: false });
});
test("Docker-dependent restart owner is enrolled exactly once on the host", () => {
  const owner = "__tests__/abuse/recovery/support-restart.test.ts";
  const targets = createProviderTargets({
    phase: "abuse",
    paths: [owner, "__tests__/abuse/auth/session.test.ts"],
    dockerPrefix: ["docker"],
  });
  expect(targets[0]?.paths).not.toContain(owner);
  expect(targets[1]?.paths).toEqual([owner]);
  expect(
    targets.flatMap((target) => target.paths).filter((path) => path === owner),
  ).toHaveLength(1);
});
test("empty selector is not run, setup rejection is reported and later phases still run", async () => {
  const result = await runPhases({
    targets: [
      { name: "empty", paths: [], commands: [["must-not-run"]] },
      { name: "setup", paths: ["setup.test.ts"], commands: [["setup-fails"]] },
      { name: "later", paths: ["later.test.ts"], commands: [["pass"]] },
    ],
    retry: 0,
    execute: async (command) => {
      if (command[0] === "must-not-run")
        throw new Error("Empty selector executed");
      if (command[0] === "setup-fails")
        throw new Error("Synthetic setup rejection");
      return { code: 0, evidence: "private.log" };
    },
  });
  expect(result.map((phase) => phase.result)).toEqual([
    "not-run",
    "fail",
    "pass",
  ]);
  expect(result[1]?.attempts[0]?.actual).toContain("Synthetic setup rejection");
});
test("four 24h capacity profiles each receive a separate bounded command without duplicating owner", () => {
  const owner = "__tests__/integration/realtime-capacity.host.test.ts";
  const targets = createProviderTargets({
    phase: "integration",
    paths: [owner, "__tests__/integration/other.host.test.ts"],
    dockerPrefix: ["docker"],
  });
  const host = targets.find((target) => target.name === "integration-host");
  expect(host?.commands).toHaveLength(5);
  expect(host?.commands[0]).not.toContain(`./${owner}`);
  expect(
    host?.commands
      .slice(1)
      .every(
        (command) =>
          command.includes(`./${owner}`) &&
          command.includes("--test-name-pattern"),
      ),
  ).toBe(true);
  expect(
    new Set(host?.commands.slice(1).map((command) => command.at(-1))).size,
  ).toBe(4);
  expect(host?.paths.filter((path) => path === owner)).toHaveLength(1);
});

test("each primary browser owner keeps its own bounded command on both channels without losing coverage", async () => {
  const { createBrowserTargets } = await import(
    "../../scripts/testing/phases/browser"
  );
  const paths = [
    "__tests__/e2e/auth/product.spec.ts",
    "__tests__/e2e/conversations/delivery-state.spec.ts",
  ];
  const targets = createBrowserTargets(paths).filter((target) =>
    target.name.startsWith("playwright-core-"),
  );
  expect(targets).toHaveLength(2);
  for (const target of targets) {
    expect(target.commands).toHaveLength(paths.length);
    expect(target.paths).toEqual(paths);
    expect(target.commands.map((command) => command.at(-1))).toEqual(paths);
    expect(
      target.commands.every(
        (command) =>
          command.filter((arg) => paths.includes(arg)).length === 1 &&
          !command.includes("--grep"),
      ),
    ).toBe(true);
  }
});
