import { z } from "zod";
import { readInfraConfig } from "../infra/config";
import { acceptanceEnvironmentKeys } from "./conts";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const readAcceptanceConfig = (args: readonly string[]) => {
  const values = Object.fromEntries(
    args
      .filter((value) => value !== "--")
      .map((argument) => {
        const [key, ...value] = argument.replace(/^--/, "").split("=");
        return [key, value.join("=")];
      }),
  );
  const parsed = z
    .object({
      scope: z.enum(["core", "full"]).default("core"),
      "testhost-image": digest.optional(),
      "fe-image": digest.optional(),
      "be-image": digest.optional(),
      "stories-profile": z
        .string()
        .regex(/^\.infra\/[a-z0-9-]+\.json$/)
        .optional(),
      retry: z.coerce.number().int().min(0).max(1).default(0),
      "telemetry-profile": z
        .string()
        .regex(/^\.infra\/[a-z0-9-]+\.json$/)
        .optional(),
      "default-profile": z
        .string()
        .regex(/^\.infra\/[a-z0-9-]+\.json$/)
        .optional(),
    })
    .strict()
    .refine(
      (value) => value.scope === "full" || !value["stories-profile"],
      "Stories profile requires full scope",
    )
    .parse(values);
  return { ...parsed, infrastructure: readInfraConfig() };
};
export const readAcceptanceEnvironment = (
  config: ReturnType<typeof readAcceptanceConfig>,
) => {
  const environment = Object.fromEntries(
    Object.entries(Bun.env).filter(
      ([key, value]) => key !== "FORCE_COLOR" && typeof value === "string",
    ),
  );
  return {
    ...environment,
    ...(config["stories-profile"]
      ? {
          [acceptanceEnvironmentKeys.composeFile]: `compose.yaml:${config["stories-profile"]}`,
        }
      : {}),
    ...Object.fromEntries([
      ["NO_COLOR", "1"],
      ["DOCKER_HOST", config.infrastructure.endpoint],
      ["COMPOSE_PROJECT_NAME", config.infrastructure.project],
      ["AUTH05_TESTHOST_IMAGE", config["testhost-image"]],
      ["CHAT03_TESTHOST_IMAGE", config["testhost-image"]],
    ]),
  };
};
