import { coreParts, deferredParts } from "../scenarios/conts";
import { buildScenarioResult } from "./scenario";
import { testReportSchema } from "./schema";
import type { TestReportInput } from "./types";
export const buildTestReport = (input: TestReportInput) => {
  const scenarios = [...coreParts, ...deferredParts].map((key) =>
    buildScenarioResult({ input, key }),
  );
  const accepted =
    input.setup.result === "pass" &&
    !input.coverageErrors.length &&
    input.phases.length > 0 &&
    input.phases.every((phase) => phase.result === "pass" && !phase.flake) &&
    scenarios
      .filter((scenario) => scenario.required)
      .every((scenario) => scenario.result === "pass");
  return testReportSchema.parse({ ...input, scenarios, accepted });
};
