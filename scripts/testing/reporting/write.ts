import { chmod, mkdir } from "node:fs/promises";
import { artifactPermissions } from "../conts";
import { testReportSchema } from "./schema";
import type { TestReport } from "./types";
export const writeTestReport = async ({
  directory,
  report,
}: {
  readonly directory: string;
  readonly report: TestReport;
}) => {
  await mkdir(directory, {
    recursive: true,
    mode: artifactPermissions.directory,
  });
  await chmod(directory, artifactPermissions.directory);
  const path = `${directory}/report.json`;
  await Bun.write(
    path,
    `${JSON.stringify(testReportSchema.parse(report), null, 2)}\n`,
  );
  await chmod(path, artifactPermissions.file);
  return path;
};
