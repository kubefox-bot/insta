import { z } from "zod";
import { phases } from "../conts";
import { browserTargetNames } from "./conts";
import type { Phase, PhaseTarget } from "./types";

export const readPhase = (value: string | undefined): Phase => {
  const result = z.enum(phases).safeParse(value);
  if (!result.success)
    throw new Error("Expected integration, abuse or e2e phase");
  return result.data;
};

export const selectPhaseTargets = ({
  phase,
  planned,
  requested,
}: Readonly<{
  phase: Phase;
  planned: readonly PhaseTarget[];
  requested: readonly string[];
}>): readonly PhaseTarget[] => {
  const selectors = requested.map((path) => path.replace(/^\.\//, ""));
  const phaseTargets = planned.filter((target) =>
    phase === "e2e"
      ? Object.values(browserTargetNames.primary).some(
          (name) => target.name === name,
        )
      : target.name.startsWith(`${phase}-`),
  );
  const discovered = phaseTargets.flatMap((target) => target.paths);
  for (const path of selectors)
    if (!discovered.includes(path))
      throw new Error(`Requested selector is not in ${phase}: ${path}`);
  // Keep the command's concrete file selection in sync with its reported paths.
  const targets = phaseTargets
    .map((target) => {
      if (!selectors.length) return target;
      const paths = target.paths.filter((path) => selectors.includes(path));
      const commands = paths.length
        ? target.commands.map((command) =>
            command.filter(
              (argument) =>
                !discovered.some(
                  (path) => argument === path || argument === `./${path}`,
                ) ||
                paths.some(
                  (path) => argument === path || argument === `./${path}`,
                ),
            ),
          )
        : [];
      return { ...target, paths, commands };
    })
    .filter((target) => target.paths.length);
  if (!targets.length)
    throw new Error(`No selected tests in ${phase}; refusing implicit run-all`);
  return targets;
};
