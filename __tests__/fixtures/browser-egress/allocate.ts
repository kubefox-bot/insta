import { z } from "zod";
import { readInfraConfig } from "../../../scripts/infra/config";
import { docker } from "../docker";
import { dockerFields } from "./conts";
import { reserveEgressAddress } from "./lease";

const networkSchema = z
  .array(
    z.object({
      [dockerFields.labels]: z.record(z.string(), z.string()),
      [dockerFields.ipam]: z.object({
        [dockerFields.config]: z.array(
          z.object({
            [dockerFields.subnet]: z.string(),
            [dockerFields.gateway]: z.string().optional(),
          }),
        ),
      }),
      [dockerFields.containers]: z.record(
        z.string(),
        z.object({ [dockerFields.ipv4Address]: z.string() }),
      ),
    }),
  )
  .length(1);
export const allocateEgressAddress = async (runId: string) => {
  const config = readInfraConfig();
  const network = `${config.project}_default`;
  const [state] = networkSchema.parse(
    JSON.parse(await docker("network", "inspect", network)),
  );
  if (!state || state.Labels["com.docker.compose.project"] !== config.project)
    throw new Error("Refusing foreign egress network");
  const ipv4 = state.IPAM.Config.find(
    (entry) =>
      z
        .string()
        .regex(/^[0-9.]+\/[0-9]+$/)
        .safeParse(entry.Subnet).success,
  );
  if (!ipv4) throw new Error("No actual IPv4 egress network");
  const occupied = new Set([
    ...Object.values(state.Containers).map(
      (container) => container.IPv4Address.split("/")[0] ?? "",
    ),
    ...(ipv4.Gateway ? [ipv4.Gateway] : []),
  ]);
  const address = await reserveEgressAddress({
    directory: ".infra/browser-egress",
    subnet: ipv4.Subnet,
    occupied,
    runId,
    now: Date.now(),
  });
  return { address, network };
};
