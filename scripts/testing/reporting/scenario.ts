import type { PhaseResult } from "../phases/types";
import { coreParts, deferredReason } from "../scenarios/conts";
import { scenarioOwners } from "../scenarios/index";
import type { ScenarioPart } from "../scenarios/types";
import type { TestReportInput } from "./types";

const ownerResult = ({
  required,
  covered,
  phases,
}: {
  readonly required: boolean;
  readonly covered: boolean;
  readonly phases: readonly PhaseResult[];
}) => {
  if (!required || !phases.length) return "not-run";
  if (covered) return "pass";
  return phases.some((phase) => phase.result === "fail") ? "fail" : "not-run";
};
const actualResult = ({
  required,
  covered,
}: {
  readonly required: boolean;
  readonly covered: boolean;
}) => {
  if (!required) return deferredReason;
  return covered
    ? "All enrolled owner commands passed; inspect evidence for individual assertions"
    : "Required owner did not fully pass; no individual success inferred";
};
export const buildScenarioResult = ({
  input,
  key,
}: {
  readonly input: TestReportInput;
  readonly key: ScenarioPart;
}) => {
  const [scenarioId, scenarioPart] = key.split(":");
  const required =
    input.scope === "full" || coreParts.some((part) => part === key);
  const owner = scenarioOwners.find((owner) => owner.key === key);
  const paths: readonly string[] = owner?.paths ?? [];
  const phases = input.phases.filter((phase) =>
    phase.paths.some((path) => paths.includes(path)),
  );
  const completeOwners = phases.filter(
    (phase) => phase.coverage !== "filtered",
  );
  const covered =
    paths.length > 0 &&
    paths.every((path) => {
      const owners = completeOwners.filter((phase) =>
        phase.paths.includes(path),
      );
      return (
        owners.length > 0 && owners.every((phase) => phase.result === "pass")
      );
    });
  return {
    scenarioId,
    scenarioPart,
    required,
    ...(!required ? { deferredReason } : {}),
    faultPoint: owner?.faultPoint ?? "Not implemented in authorized core scope",
    expected:
      owner?.expected ??
      "Future full acceptance requires owned real media tests",
    actual: actualResult({ required, covered }),
    result: ownerResult({ required, covered, phases: completeOwners }),
    attempts: phases.flatMap((phase) => phase.attempts),
    evidence: phases.flatMap((phase) =>
      phase.attempts.flatMap((attempt) => attempt.evidence),
    ),
  };
};
