import { expect, test } from "bun:test";
import { createBrowserTargets } from "../../scripts/testing/phases/browser";
import { runPhases } from "../../scripts/testing/phases/run";
import { buildTestReport } from "../../scripts/testing/reporting/build";
import { buildScenarioResult } from "../../scripts/testing/reporting/scenario";
import { scenarioOwners } from "../../scripts/testing/scenarios/index";

test("failed setup never makes required core owners green; deferred media stays separate", () => {
  const report = buildTestReport({
    scope: "core",
    testRunId: crypto.randomUUID(),
    seed: "fixed",
    version: { bun: "test" },
    setup: { result: "fail", actual: "Synthetic missing image", evidence: [] },
    phases: [],
    coverageErrors: [],
  });
  expect(report.accepted).toBe(false);
  expect(
    report.scenarios
      .filter((scenario) => scenario.required)
      .every((scenario) => scenario.result === "not-run"),
  ).toBe(true);
  expect(
    report.scenarios.find((scenario) => scenario.scenarioId === "E10"),
  ).toMatchObject({
    required: false,
    result: "not-run",
    deferredReason: expect.stringContaining("deferred_by_user"),
  });
});
test("a partially executed owner remains not-run; no path-level success is invented", () => {
  const report = buildTestReport({
    scope: "core",
    testRunId: crypto.randomUUID(),
    seed: "fixed",
    version: {},
    setup: { result: "pass", actual: "Prepared", evidence: [] },
    phases: [
      {
        name: "partial",
        paths: ["__tests__/e2e/conversations/chat.spec.ts"],
        result: "pass",
        attempts: [{ code: 0, evidence: ["private.log"], actual: "Passed" }],
        flake: false,
      },
    ],
    coverageErrors: [],
  });
  expect(
    report.scenarios.find((scenario) => scenario.scenarioId === "A01"),
  ).toMatchObject({ result: "not-run" });
  expect(report.accepted).toBe(false);
});

for (const primaryResult of ["fail", "not-run", "pass"] as const) {
  test(`filtered auth/chat smoke cannot replace ${primaryResult} primary A14 coverage`, async () => {
    const primary = "__tests__/e2e/conversations/chat.spec.ts";
    const targets = createBrowserTargets([
      primary,
      "__tests__/e2e/conversations/delivery.spec.ts",
      "__tests__/e2e/conversations/delivery-restart.spec.ts",
      "__tests__/e2e/conversations/delivery-state.spec.ts",
    ]).slice(0, 3);
    const browserPhases = await runPhases({
      targets: targets.map((target) =>
        target.name.startsWith("playwright-core-") &&
        primaryResult === "not-run"
          ? { ...target, commands: [] }
          : target,
      ),
      retry: 0,
      execute: async (command) => ({
        code: !command.includes("--grep") && primaryResult === "fail" ? 1 : 0,
        evidence: command.includes("--grep") ? "smoke.log" : "primary.log",
      }),
    });
    const report = buildTestReport({
      scope: "core",
      testRunId: crypto.randomUUID(),
      seed: "fixed",
      version: {},
      setup: { result: "pass", actual: "Prepared", evidence: [] },
      phases: [
        {
          name: "integration-providers",
          paths: [
            "__tests__/integration/delivery-ws.test.ts",
            "__tests__/abuse/conversations/delivery.test.ts",
            "__tests__/integration/conversations.test.ts",
          ],
          result: "pass",
          attempts: [
            { code: 0, evidence: ["integration.log"], actual: "Passed" },
          ],
          flake: false,
        },
        ...browserPhases,
      ],
      coverageErrors: [],
    });
    expect(
      report.phases.find(
        (phase) => phase.name === "chrome-edge-auth-chat-smoke",
      )?.coverage,
    ).toBe("filtered");
    const scenario = report.scenarios.find((item) => item.scenarioId === "A14");
    expect(scenario?.result).toBe(primaryResult);
    expect(scenario?.evidence).toContain("smoke.log");
    if (primaryResult === "fail")
      expect(scenario?.attempts.map((attempt) => attempt.code)).toContain(1);
    if (primaryResult !== "pass")
      expect(scenario?.actual).not.toContain(
        "All enrolled owner commands passed",
      );
  });
}

test("all complete core owners still pass while deferred media remains not-run", () => {
  const report = buildTestReport({
    scope: "core",
    testRunId: crypto.randomUUID(),
    seed: "fixed",
    version: {},
    setup: { result: "pass", actual: "Prepared", evidence: [] },
    phases: [
      {
        name: "complete-owners",
        coverage: "full-owner",
        paths: [...new Set(scenarioOwners.flatMap((owner) => owner.paths))],
        result: "pass",
        attempts: [{ code: 0, evidence: ["primary.log"], actual: "Passed" }],
        flake: false,
      },
    ],
    coverageErrors: [],
  });
  expect(report.accepted).toBe(true);
  expect(
    report.scenarios.filter(
      (scenario) => scenario.required && scenario.result === "pass",
    ),
  ).toHaveLength(39);
  expect(
    report.scenarios.filter(
      (scenario) => !scenario.required && scenario.result === "not-run",
    ),
  ).toHaveLength(14);
});
test("one passing browser channel cannot cover a failed or absent second channel", () => {
  for (const result of ["fail", "not-run"] as const) {
    const paths = [
      "__tests__/integration/conversations.test.ts",
      "__tests__/e2e/conversations/chat.spec.ts",
    ] as const;
    const scenario = buildScenarioResult({
      key: "A14:history-gap",
      input: {
        scope: "full",
        testRunId: "synthetic",
        seed: "fixed",
        version: {},
        setup: { result: "pass", actual: "Prepared", evidence: [] },
        coverageErrors: [],
        phases: [
          {
            name: "integration-providers",
            paths: [
              paths[0],
              "__tests__/integration/delivery-ws.test.ts",
              "__tests__/abuse/conversations/delivery.test.ts",
            ],
            result: "pass",
            attempts: [],
            flake: false,
          },
          {
            name: "playwright-core-chrome",
            paths: [paths[1]],
            result: "pass",
            attempts: [],
            flake: false,
          },
          {
            name: "playwright-core-msedge",
            paths: [paths[1]],
            result,
            attempts: [],
            flake: false,
          },
        ],
      },
    });
    expect(scenario.result).toBe(result);
  }
});
