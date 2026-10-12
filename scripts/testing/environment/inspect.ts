import { z } from "zod";
import { docker } from "../../infra/docker";
import { containerSchema } from "../../infra/host/containers";
import { assertProjectOwnership } from "../../infra/host/preflight";
import { inspectFields as fields } from "../conts";

const stateSchema = containerSchema.element.extend({
  [fields.image]: z.string(),
  [fields.mounts]: z.array(z.object({ [fields.destination]: z.string() })),
});
export const verifyRunningImage = async ({
  service,
  expected,
  project,
}: {
  readonly service: string;
  readonly expected: string;
  readonly project: string;
}) => {
  const id = await docker(
    "compose",
    "--project-name",
    project,
    "ps",
    "-q",
    service,
  );
  if (!id) throw new Error(`Required ${service} is not running`);
  validatePreparedApplication({
    input: JSON.parse(await docker("inspect", id)),
    expected,
    service,
    project,
  });
};

/** Проверяет фактическую readiness, immutable image и отсутствие source mounts перед выполнением acceptance. */
export const validatePreparedApplication = ({
  input,
  expected,
  service,
  project,
}: Readonly<{
  input: unknown;
  expected: string;
  service: string;
  project: string;
}>) => {
  const state = z.array(stateSchema).parse(input)[0];
  if (
    !state ||
    state.Image !== expected ||
    !state.State.Running ||
    state.State.Health?.Status !== "healthy"
  )
    throw new Error(
      `Required ${service} immutable identity/readiness mismatch`,
    );
  assertProjectOwnership([state]);
  if (
    state.Config.Labels?.["com.docker.compose.project"] !== project ||
    state.Config.Labels?.["com.docker.compose.service"] !== service
  )
    throw new Error("Prepared application project/service labels mismatch");
  if (state.Mounts.some((mount) => mount.Destination.startsWith("/workspace")))
    throw new Error(`${service} has forbidden source/dependency mounts`);
};
