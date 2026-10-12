import { z } from "zod";
import { docker } from "../../infra/docker";
import { coreStoriesMode } from "../conts";
import { storiesEnvironmentKeys } from "../stories/conts";

const environmentSchema = z.array(z.string()).transform((entries) =>
  Object.fromEntries(
    entries.map((entry) => {
      const separator = entry.indexOf("=");
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  ),
);
const coreEnvironmentSchema = z.object({
  applications: z.object({
    "be-insta": environmentSchema,
    "fe-insta": environmentSchema,
  }),
  testhost: z.object({
    imageEnvironment: environmentSchema,
    environment: z.record(z.string(), z.string().nullable()),
  }),
});
const disabledModeSchema = z.literal(coreStoriesMode).default(coreStoriesMode);
export const validateCoreEnvironment = (input: unknown) => {
  const parsed = coreEnvironmentSchema.parse(input);
  const testhost = {
    ...parsed.testhost.imageEnvironment,
    ...parsed.testhost.environment,
  };
  for (const environment of [...Object.values(parsed.applications), testhost])
    if (
      !disabledModeSchema.safeParse(
        environment[storiesEnvironmentKeys.mode] ?? undefined,
      ).success
    )
      throw new Error(
        "Core acceptance requires disabled Stories in running applications and effective testhost configuration",
      );
};
const effectiveComposeSchema = z.object({
  services: z.object({
    testhost: z.object({
      environment: z.record(z.string(), z.string().nullable()).default({}),
    }),
  }),
});
const readRunningApplications = async (project: string) => {
  return Object.fromEntries(
    await Promise.all(
      ["be-insta", "fe-insta"].map(async (service) => {
        const container = await docker(
          "compose",
          "--project-name",
          project,
          "ps",
          "-q",
          service,
        );
        return [
          service,
          JSON.parse(
            await docker(
              "inspect",
              "--format",
              "{{json .Config.Env}}",
              container,
            ),
          ),
        ];
      }),
    ),
  );
};
export const verifyCoreEnvironment = async ({
  project,
  testhostImage,
}: Readonly<{ project: string; testhostImage: string }>) => {
  const applications = await readRunningApplications(project);
  const imageEnvironment = JSON.parse(
    await docker(
      "image",
      "inspect",
      "--format",
      "{{json .Config.Env}}",
      testhostImage,
    ),
  );
  // Core phase commands explicitly select compose.yaml; their owned overlay only changes image/user/mounts.
  const effective = effectiveComposeSchema.parse(
    JSON.parse(
      await docker(
        "compose",
        "--project-name",
        project,
        "-f",
        "compose.yaml",
        "--profile",
        "test",
        "config",
        "--format",
        "json",
      ),
    ),
  );
  validateCoreEnvironment({
    applications,
    testhost: {
      imageEnvironment,
      environment: effective.services.testhost.environment,
    },
  });
};
