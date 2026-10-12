import { z } from "zod";
import { docker } from "../../infra/docker";
import type { AcceptanceConfig } from "../types";
import { verifyDeliveryConfiguration } from "./delivery-configuration";
import { validateDeliveryResources } from "./delivery-resources";

const healthSchema = z.object({
  status: z.literal("ok"),
  delivery: z.literal("ok"),
});
/** Общий HTTP200 допускает degraded; delivery acceptance требует собственный ok. */
export const validateDeliveryAcceptance = (input: unknown) => {
  if (!healthSchema.safeParse(input).success)
    throw new Error("Prepared delivery provider is not ready");
};
/** Проверяет независимый provider/init и реальную delivery readiness до запуска Core/Full acceptance. */
export const verifyDeliveryEnvironment = async (config: AcceptanceConfig) => {
  const prefix = [
    "compose",
    "--project-name",
    config.infrastructure.project,
    "-f",
    "compose.yaml",
    ...(config.scope === "full" && config["stories-profile"]
      ? ["-f", config["stories-profile"]]
      : []),
  ];
  const ids = await docker(
    ...prefix,
    "ps",
    "--all",
    "-q",
    "dragonfly-delivery",
    "delivery-broker-init",
  );
  if (!ids) throw new Error("Prepared delivery services absent");
  validateDeliveryResources({
    input: JSON.parse(await docker("inspect", ...ids.split(/\s+/))),
    project: config.infrastructure.project,
  });
  const backend = await docker(...prefix, "ps", "-q", "be-insta");
  await verifyDeliveryConfiguration({ prefix, backend });
  const health = JSON.parse(
    await docker(
      "exec",
      backend,
      "bun",
      "-e",
      'const response=await fetch("http://127.0.0.1:3001/health/ready"); const body=await response.json(); if(!response.ok)process.exit(1);console.log(JSON.stringify(body.data));',
    ),
  );
  validateDeliveryAcceptance(health);
};
