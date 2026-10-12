import { telemetryPhaseNames } from "../conts";
import type { PhaseResult } from "../phases/types";
import { createTelemetryTestTarget } from "./targets";
export const telemetryPreparationFailure = (): readonly PhaseResult[] => {
  const tests = createTelemetryTestTarget();
  return [
    {
      name: telemetryPhaseNames.setup,
      paths: ["receiver-setup"],
      result: "fail",
      attempts: [
        {
          code: 1,
          evidence: [],
          actual:
            "Profile preparation failed before runtime mutation; inspect prepared profiles",
        },
      ],
      flake: false,
    },
    ...[
      { name: tests.name, paths: tests.paths },
      { name: telemetryPhaseNames.restore, paths: ["default-restoration"] },
      { name: telemetryPhaseNames.stop, paths: ["receiver-stop"] },
    ].map((target) => ({
      ...target,
      result: "not-run" as const,
      attempts: [],
      flake: false,
    })),
  ];
};
