import { z } from "zod";
import { composeFields, telemetrySourceKeys } from "../conts";
import { verifyTelemetryStories } from "../stories/telemetry";
import type { AcceptanceConfig } from "../types";

const serviceSchema = z
  .object({
    image: z.string(),
    user: z.string().optional(),
    [composeFields.workingDirectory]: z.string().optional(),
    volumes: z.array(z.string()).optional(),
    environment: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();
const profileSchema = z.object({
  services: z.record(z.string(), serviceSchema),
});
const verifyImages = ({
  profile,
  config,
}: {
  readonly profile: z.infer<typeof profileSchema>;
  readonly config: AcceptanceConfig;
}) => {
  for (const [service, key] of [
    ["be-insta", "be-image"],
    ["fe-insta", "fe-image"],
    ["testhost", "testhost-image"],
  ] as const) {
    if (profile.services[service]?.image !== config[key])
      throw new Error(`Telemetry profile ${service} image mismatch`);
  }
};
export const validateTelemetryProfiles = ({
  active,
  defaults,
  config,
}: {
  readonly active: unknown;
  readonly defaults: unknown;
  readonly config: AcceptanceConfig;
}) => {
  const optional = profileSchema.parse(active);
  const disabled = profileSchema.parse(defaults);
  verifyTelemetryStories({ optional, disabled, config });
  verifyImages({ profile: optional, config });
  verifyImages({ profile: disabled, config });
  const receiver = optional.services["telemetry-receiver"];
  if (
    !receiver ||
    receiver.image !== config["testhost-image"] ||
    receiver.user !== "bun" ||
    receiver.working_dir !== "/workspace" ||
    receiver.volumes?.length !== 0
  )
    throw new Error(
      "Telemetry receiver requires exact prepared image, bun, /workspace and zero mounts",
    );
  if (
    optional.services["fe-insta"]?.environment?.[telemetrySourceKeys.faro] !==
      "http://telemetry-receiver:4318/collect" ||
    optional.services["be-insta"]?.environment?.[telemetrySourceKeys.otel] !==
      "http://telemetry-receiver:4318/v1/traces"
  )
    throw new Error("Only the owned local telemetry receiver is allowed");
  if (
    disabled.services["fe-insta"]?.environment?.[telemetrySourceKeys.faro] !==
      "" ||
    disabled.services["be-insta"]?.environment?.[telemetrySourceKeys.otel] !==
      ""
  )
    throw new Error(
      "Default restoration must disable both optional receiver URLs",
    );
  return { optional, disabled };
};
