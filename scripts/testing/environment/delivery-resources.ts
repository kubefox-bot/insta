import { z } from "zod";
import {
  containerSchema,
  initializedForProcess,
} from "../../infra/host/containers";
import { deliveryAcceptance } from "./conts";

const providerSchema = z.array(
  z.object({
    ["Config"]: z.object({
      ["Labels"]: z.record(z.string(), z.string()),
      ["Image"]: z.string(),
      ["Cmd"]: z.array(z.string()).nullable(),
    }),
    ["HostConfig"]: z.object({ ["Memory"]: z.number() }),
    ["Mounts"]: z.array(
      z.object({
        ["Destination"]: z.string(),
        ["Name"]: z.string().optional(),
        ["Type"]: z.string(),
      }),
    ),
  }),
);
/** Проверяет текущий init, pinned provider, измеренный memory budget и отдельный project-owned volume. */
export const validateDeliveryResources = ({
  input,
  project,
}: Readonly<{ input: unknown; project: string }>) => {
  const containers = containerSchema.parse(input);
  if (
    !initializedForProcess({
      containers,
      service: "delivery-broker-init",
      dependency: "dragonfly-delivery",
    })
  )
    throw new Error(
      "Prepared delivery bootstrap does not match current process",
    );
  const provider = providerSchema
    .parse(input)
    .find(
      (value) =>
        value.Config.Labels["com.docker.compose.service"] ===
        "dragonfly-delivery",
    );
  if (
    provider?.Config.Image !== deliveryAcceptance.image ||
    provider.HostConfig.Memory !== deliveryAcceptance.containerBytes ||
    !provider.Config.Cmd?.includes(deliveryAcceptance.maxMemoryArgument) ||
    !provider.Mounts.some(
      (mount) =>
        mount.Type === "volume" &&
        mount.Destination === "/data" &&
        mount.Name === project + "_dragonfly-delivery-data",
    )
  )
    throw new Error("Prepared delivery resource policy mismatch");
};
