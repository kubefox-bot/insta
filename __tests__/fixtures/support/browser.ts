import { readInfraConfig } from "../../../scripts/infra/config";
import { docker } from "../docker";
export const probeSupportBrowserReport = async (
  action: "inspect" | "cleanup",
  comment: string,
) =>
  JSON.parse(
    await docker(
      "compose",
      "--project-name",
      readInfraConfig().project,
      "run",
      "--rm",
      "--no-deps",
      "--label",
      `insta.testRunId=insta-auth06-${crypto.randomUUID()}`,
      "testhost",
      "bun",
      "__tests__/fixtures/support/browser-probe.ts",
      action,
      comment,
    ),
  );
