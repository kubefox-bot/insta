import { readInfraConfig } from "../../../scripts/infra/config";
import { containerSchema } from "../../../scripts/infra/host/containers";
import { backendService } from "../../../scripts/infra/host/conts";
import { assertProjectOwnership } from "../../../scripts/infra/host/preflight";
import { validateDeliveryAcceptance } from "../../../scripts/testing/environment/delivery";
import { waitUntil } from "../barrier";
import { docker } from "../docker";
import { gatewayRestartReadyMs } from "./conts";

/** Перезапускает только существующий backend выбранного checkout/project; volumes и остальные сервисы не затрагивает. */
export const restartPreparedGateway = async () => {
  const { project } = readInfraConfig();
  const id = await docker(
    "compose",
    "--project-name",
    project,
    "ps",
    "-q",
    backendService,
  );
  if (!id) throw new Error("Prepared gateway is absent");
  const states = containerSchema.parse(JSON.parse(await docker("inspect", id)));
  assertProjectOwnership(states);
  const state = states[0];
  if (
    states.length !== 1 ||
    state?.Config.Labels?.["com.docker.compose.project"] !== project ||
    state.Config.Labels["com.docker.compose.service"] !== backendService
  )
    throw new Error("Refusing foreign gateway restart");
  await docker("restart", id);
  await waitUntil({
    timeoutMs: gatewayRestartReadyMs,
    check: async () => {
      const [current] = containerSchema.parse(
        JSON.parse(await docker("inspect", id)),
      );
      return (
        current?.State.StartedAt !== state.State.StartedAt &&
        current?.State.Running === true &&
        current.State.Health?.Status === "healthy"
      );
    },
  });
  const health: unknown = JSON.parse(
    await docker(
      "exec",
      id,
      "bun",
      "-e",
      'const response=await fetch("http://127.0.0.1:3001/health/ready");if(!response.ok)process.exit(1);console.log(JSON.stringify((await response.json()).data));',
    ),
  );
  validateDeliveryAcceptance(health);
};
