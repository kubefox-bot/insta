import { cleanupPolicy } from "./conts";
import type { OwnedResource } from "./types";
export const cleanupResources = async ({
  testRunId,
  resources,
  execute,
}: {
  readonly testRunId: string;
  readonly resources: readonly OwnedResource[];
  readonly execute: (...args: string[]) => Promise<string>;
}) => {
  if (
    !/^insta-(?:fnd(?:04|05)|priv01|auth02|auth04|auth05|auth06|chat03|chat05|egress)-[a-f0-9-]+$/.test(
      testRunId,
    )
  )
    throw new Error("Invalid cleanup ownership");
  const failures: unknown[] = [];
  for (const resource of [...resources].reverse()) {
    try {
      const policy = cleanupPolicy[resource.kind];
      const owner = await execute(
        resource.kind,
        "inspect",
        "--format",
        `{{index ${policy.labelField} "insta.testRunId"}}`,
        resource.id,
      );
      if (owner !== testRunId)
        throw new Error("Refusing cleanup of unowned resource");

      await execute(resource.kind, "rm", ...policy.options, resource.id);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Owned resource cleanup incomplete");
};
