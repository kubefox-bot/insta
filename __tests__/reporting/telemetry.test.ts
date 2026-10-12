import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { readAcceptanceConfig } from "../../scripts/testing/config";
import {
  composeFields,
  telemetrySourceKeys,
} from "../../scripts/testing/conts";
import { telemetryPreparationFailure } from "../../scripts/testing/telemetry/preparation-failure";
import { runTelemetryPhase } from "../../scripts/testing/telemetry/run";

test("pre-mutation profile failure leaves telemetry tests and both restoration operations explicitly not-run", () => {
  const phases = telemetryPreparationFailure();
  expect(phases.map((phase) => phase.result)).toEqual([
    "fail",
    "not-run",
    "not-run",
    "not-run",
  ]);
  expect(phases[0]?.paths).not.toContain(
    "__tests__/e2e/main-telemetry.spec.ts",
  );
  expect(phases[1]?.paths).toEqual(["__tests__/e2e/main-telemetry.spec.ts"]);
});

import { validateTelemetryProfiles } from "../../scripts/testing/telemetry/validate";

const image = `sha256:${"a".repeat(64)}`;
const configuration = () =>
  readAcceptanceConfig([
    `--testhost-image=${image}`,
    `--be-image=${image}`,
    `--fe-image=${image}`,
  ]);
const profiles = () => {
  const services = {
    "be-insta": { image, environment: { [telemetrySourceKeys.otel]: "" } },
    "fe-insta": { image, environment: { [telemetrySourceKeys.faro]: "" } },
    testhost: { image },
  };
  return {
    defaults: { services },
    active: {
      services: {
        ...services,
        "be-insta": {
          image,
          environment: {
            [telemetrySourceKeys.otel]:
              "http://telemetry-receiver:4318/v1/traces",
          },
        },
        "fe-insta": {
          image,
          environment: {
            [telemetrySourceKeys.faro]:
              "http://telemetry-receiver:4318/collect",
          },
        },
        "telemetry-receiver": {
          image,
          user: "bun",
          [composeFields.workingDirectory]: "/workspace",
          volumes: [],
        },
      },
    },
  };
};
test("optional profile rejects mismatched images, receiver mounts and external URLs before effects", () => {
  const { active, defaults } = profiles();
  expect(() =>
    validateTelemetryProfiles({ active, defaults, config: configuration() }),
  ).not.toThrow();
  for (const receiver of [
    {
      ...active.services["telemetry-receiver"],
      volumes: ["foreign:/workspace"],
    },
    {
      ...active.services["telemetry-receiver"],
      image: `sha256:${"b".repeat(64)}`,
    },
  ]) {
    expect(() =>
      validateTelemetryProfiles({
        active: {
          services: { ...active.services, "telemetry-receiver": receiver },
        },
        defaults,
        config: configuration(),
      }),
    ).toThrow();
  }
  expect(() =>
    validateTelemetryProfiles({
      active: {
        services: {
          ...active.services,
          "fe-insta": {
            image,
            environment: {
              [telemetrySourceKeys.faro]: "https://external.example/collect",
            },
          },
        },
      },
      defaults,
      config: configuration(),
    }),
  ).toThrow();
});
test("failed optional test retains failure and always restores defaults and stops only owned receiver", async () => {
  const directory = await mkdtemp(".infra/done02-telemetry-test-");
  const { active, defaults } = profiles();
  const activePath = `${directory}/active.json`;
  const defaultPath = `${directory}/default.json`;
  await Bun.write(activePath, JSON.stringify(active));
  await Bun.write(defaultPath, JSON.stringify(defaults));
  const commands: string[][] = [];
  try {
    const result = await runTelemetryPhase({
      config: {
        ...configuration(),
        "telemetry-profile": activePath,
        "default-profile": defaultPath,
      },
      directory,
      testRunId: crypto.randomUUID(),
      execute: async (command) => {
        commands.push([...command]);
        return {
          code: command.includes("__tests__/e2e/main-telemetry.spec.ts")
            ? 1
            : 0,
          evidence: "private.log",
        };
      },
    });
    expect(result.map((phase) => [phase.name, phase.result])).toEqual([
      ["optional-telemetry-setup", "pass"],
      ["optional-main-telemetry", "fail"],
      ["default-restoration", "pass"],
      ["owned-receiver-stop", "pass"],
    ]);
    expect(commands.at(-1)?.[1]).toBe(
      "scripts/testing/telemetry/stop-owned.ts",
    );
    expect(
      await Bun.file(`${directory}/receiver-ownership.json`).exists(),
    ).toBe(false);
  } finally {
    await rm(directory, { recursive: true });
  }
});
