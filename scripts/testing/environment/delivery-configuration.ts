import { z } from "zod";
import { docker } from "../../infra/docker";
/** Сверяет фактическую backend конфигурацию с эффективным testhost профилем без вывода URL/пароля. */
export const verifyDeliveryConfiguration = async ({
  prefix,
  backend,
}: Readonly<{ prefix: readonly string[]; backend: string }>) => {
  const environment = z
    .array(z.string())
    .parse(
      JSON.parse(
        await docker("inspect", "--format", "{{json .Config.Env}}", backend),
      ),
    );
  const runningUrl = environment
    .find((value) => value.startsWith("DELIVERY_DRAGONFLY_URL="))
    ?.slice("DELIVERY_DRAGONFLY_URL=".length);
  const effective = z
    .object({
      services: z.object({
        testhost: z.object({ environment: z.record(z.string(), z.unknown()) }),
      }),
    })
    .parse(
      JSON.parse(
        await docker(
          ...prefix,
          "--profile",
          "test",
          "config",
          "--format",
          "json",
        ),
      ),
    );
  if (
    !runningUrl ||
    runningUrl !==
      effective.services.testhost.environment.DELIVERY_DRAGONFLY_URL
  )
    throw new Error("Prepared backend/testhost delivery configuration differs");
};
