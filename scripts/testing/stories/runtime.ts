import { z } from "zod";
import { docker } from "../../infra/docker";
import type { AcceptanceConfig } from "../types";
import { storiesEnvironmentKeys } from "./conts";
import type { storiesProfileSchema } from "./schema";

const runtimeSchema = z.object({
  user: z.literal("bun"),
  environment: z.array(z.string()),
  mounts: z.array(z.unknown()).length(0),
});
export const validateStoryRuntime = ({
  actual,
  expected,
}: Readonly<{
  actual: unknown;
  expected: Readonly<Record<string, string>>;
}>) => {
  const parsed = runtimeSchema.safeParse(actual);
  if (!parsed.success)
    throw new Error("Stories runtime requires bun and zero mounts");
  const environment = Object.fromEntries(
    parsed.data.environment.map((entry) => {
      const separator = entry.indexOf("=");
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
  for (const key of Object.values(storiesEnvironmentKeys))
    if (environment[key] !== expected[key])
      throw new Error(
        "Running Stories environment differs from the reviewed profile",
      );
};
export const verifyStoryRuntime = async ({
  config,
  profile,
}: Readonly<{
  config: AcceptanceConfig;
  profile: z.infer<typeof storiesProfileSchema>;
}>) => {
  for (const service of ["be-insta", "fe-insta"]) {
    const container = await docker(
      "compose",
      "--project-name",
      config.infrastructure.project,
      "ps",
      "-q",
      service,
    );
    const actual = JSON.parse(
      await docker(
        "inspect",
        "--format",
        '{"user":{{json .Config.User}},"environment":{{json .Config.Env}},"mounts":{{json .Mounts}}}',
        container,
      ),
    );
    validateStoryRuntime({
      actual,
      expected: profile.services[service]?.environment ?? {},
    });
  }
  const volume = await docker(
    "inspect",
    "--format",
    '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}',
    `${config.infrastructure.project}-rustfs-1`,
  );
  if (volume !== `${config.infrastructure.project}_stories-storage`)
    throw new Error("Stories storage is not the isolated project-owned volume");
};
