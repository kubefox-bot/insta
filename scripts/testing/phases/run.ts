import type {
  CommandResult,
  PhaseAttempt,
  PhaseResult,
  PhaseTarget,
} from "./types";

const runAttempt = async ({
  target,
  execute,
}: {
  readonly target: PhaseTarget;
  readonly execute: (command: readonly string[]) => Promise<CommandResult>;
}): Promise<PhaseAttempt> => {
  const evidence: string[] = [];
  try {
    for (const command of target.commands) {
      const outcome = await execute(command);
      evidence.push(outcome.evidence);
      if (outcome.code !== 0)
        return {
          code: outcome.code,
          evidence,
          actual: "Command failed; no individual test success inferred",
        };
    }
    return { code: 0, evidence, actual: "All selected commands exited zero" };
  } catch (error) {
    return {
      code: 1,
      evidence,
      actual:
        error instanceof Error ? error.message : "Command acquisition failed",
    };
  }
};
const runTarget = async ({
  target,
  execute,
  retry,
}: {
  readonly target: PhaseTarget;
  readonly execute: (command: readonly string[]) => Promise<CommandResult>;
  readonly retry: number;
}): Promise<PhaseResult> => {
  if (!target.paths.length || !target.commands.length) {
    return {
      name: target.name,
      paths: target.paths,
      coverage: target.coverage ?? "full-owner",
      result: "not-run",
      attempts: [],
      flake: false,
    };
  }
  const attempts: PhaseAttempt[] = [];
  for (let attempt = 0; attempt <= retry; attempt++) {
    const outcome = await runAttempt({ target, execute });
    attempts.push(outcome);
    if (outcome.code === 0) break;
  }
  const passed = attempts.at(-1)?.code === 0;
  return {
    name: target.name,
    paths: target.paths,
    coverage: target.coverage ?? "full-owner",
    result: passed ? "pass" : "fail",
    attempts,
    flake: passed && attempts.some((attempt) => attempt.code !== 0),
  };
};
export const runPhases = async ({
  targets,
  execute,
  retry,
}: {
  readonly targets: readonly PhaseTarget[];
  readonly execute: (command: readonly string[]) => Promise<CommandResult>;
  readonly retry: number;
}): Promise<readonly PhaseResult[]> => {
  const results: PhaseResult[] = [];
  for (const target of targets) {
    process.stdout.write(
      `${JSON.stringify({ phase: target.name, status: "running", paths: target.paths })}\n`,
    );
    const result = await runTarget({ target, execute, retry });
    results.push(result);
    process.stdout.write(
      `${JSON.stringify({ phase: result.name, result: result.result, flake: result.flake })}\n`,
    );
  }
  return results;
};
