import { expect, test } from "bun:test";
import { createBrowserTargets } from "../../scripts/testing/phases/browser";
import { createPhaseTargets } from "../../scripts/testing/phases/plan";
import {
  readPhase,
  selectPhaseTargets,
} from "../../scripts/testing/phases/select";

for (const scope of ["core", "full"] as const) {
  test(`${scope} discovery excludes isolated Docker lifecycle owners and retains normal phases`, async () => {
    const targets = await createPhaseTargets({
      scope,
      dockerPrefix: ["docker", "compose"],
      includeSourceChecks: false,
    });
    const isolated = [
      "__tests__/integration/docker/lifecycle.host.test.ts",
      "__tests__/e2e/docker/lifecycle.spec.ts",
    ];
    expect(
      targets
        .flatMap((target) => target.paths)
        .filter((path) => isolated.includes(path)),
    ).toEqual([]);
    for (const target of targets) {
      for (const path of isolated) {
        expect(target.paths).not.toContain(path);
        expect(target.commands.flat()).not.toContain(path);
        expect(target.commands.flat()).not.toContain(`./${path}`);
      }
    }
    const providers = targets.find(
      (target) => target.name === "integration-providers",
    );
    expect(providers?.paths).toContain(
      "__tests__/integration/infrastructure.test.ts",
    );
    expect(providers?.commands[0]).toContain(
      "./__tests__/integration/infrastructure.test.ts",
    );
    const host = targets.find((target) => target.name === "integration-host");
    expect(host?.paths).toContain(
      "__tests__/integration/persistence.host.test.ts",
    );
    expect(host?.commands[0]).toContain(
      "./__tests__/integration/persistence.host.test.ts",
    );
    expect(
      providers?.paths.includes("__tests__/integration/stories/media.test.ts"),
    ).toBe(scope === "full");
    for (const channel of ["chrome", "msedge"]) {
      const browser = targets.find(
        (target) => target.name === `playwright-core-${channel}`,
      );
      expect(browser?.paths).toContain("__tests__/e2e/auth/product.spec.ts");
      expect(browser?.paths).toContain(
        "__tests__/e2e/conversations/chat.spec.ts",
      );
      expect(browser?.commands.flat()).toContain(
        "__tests__/e2e/auth/product.spec.ts",
      );
      expect(
        browser?.commands.every((command) =>
          command.includes(`--project=${channel}`),
        ),
      ).toBe(true);
    }
  });
}

test("phase selection rejects unknown phases and paths outside the selected phase", () => {
  expect(() => readPhase("invalid")).toThrow(
    "Expected integration, abuse or e2e phase",
  );
  expect(() => readPhase(undefined)).toThrow();
  expect(() =>
    selectPhaseTargets({
      phase: "integration",
      planned: [],
      requested: ["__tests__/config/config.test.ts"],
    }),
  ).toThrow("Requested selector is not in integration");
});

test("e2e CLI selects only the primary browser owner and keeps exact command paths", () => {
  const selected = "__tests__/e2e/auth/product.spec.ts";
  const omitted = "__tests__/e2e/conversations/chat.spec.ts";
  const planned = createBrowserTargets([selected, omitted]);
  const targets = selectPhaseTargets({
    phase: readPhase("e2e"),
    planned,
    requested: [`./${selected}`],
  });
  expect(targets.map((target) => target.name)).toEqual([
    "playwright-core-chrome",
    "playwright-core-msedge",
  ]);
  for (const [index, channel] of ["chrome", "msedge"].entries()) {
    const target = targets[index];
    expect(target?.paths).toEqual([selected]);
    expect(target?.commands[0]).toContain(selected);
    expect(target?.commands[0]).not.toContain(omitted);
    expect(target?.commands[0]).toContain(`--project=${channel}`);
  }
  expect(selectPhaseTargets({ phase: "e2e", planned, requested: [] })).toEqual([
    planned[0],
    planned[1],
  ]);
  expect(() =>
    selectPhaseTargets({
      phase: "e2e",
      planned,
      requested: ["__tests__/integration/http3.host.test.ts"],
    }),
  ).toThrow();
});

test("provider CLI retains ordered host/container owners and refuses an empty selection", () => {
  const planned = [
    {
      name: "integration-providers",
      paths: ["provider.test.ts"],
      commands: [["bun", "test", "./provider.test.ts"]],
    },
    {
      name: "integration-host",
      paths: ["host.test.ts"],
      commands: [["bun", "test", "host.test.ts"]],
    },
    {
      name: "abuse-providers",
      paths: ["abuse.test.ts"],
      commands: [["bun", "test", "abuse.test.ts"]],
    },
  ];
  expect(
    selectPhaseTargets({ phase: "integration", planned, requested: [] }),
  ).toEqual(planned.slice(0, 2));
  expect(
    selectPhaseTargets({
      phase: "integration",
      planned,
      requested: ["host.test.ts"],
    }),
  ).toEqual([planned[1]]);
  expect(() =>
    selectPhaseTargets({ phase: "abuse", planned: [], requested: [] }),
  ).toThrow("refusing implicit run-all");
});

for (const scope of ["core", "full"] as const) {
  test(`${scope} final matrix reaches frontend dates and marks fixture owners`, async () => {
    const targets = await createPhaseTargets({
      scope,
      dockerPrefix: ["docker", "compose"],
      includeSourceChecks: false,
    });
    for (const [name, path, config] of [
      [
        "playwright-frontend-dates",
        "apps/fe-insta/__tests__/browser/dates/lifecycle.spec.ts",
        "apps/fe-insta/__tests__/browser/dates/playwright.config.ts",
      ],
      [
        "playwright-frontend-marks",
        "apps/fe-insta/__tests__/browser/message-marks.spec.ts",
        "apps/fe-insta/__tests__/browser/marks/playwright.config.ts",
      ],
    ] as const) {
      const target = targets.find((item) => item.name === name);
      expect(target?.paths).toContain(path);
      expect(target?.commands[0]).toContain(config);
    }
  });
}
