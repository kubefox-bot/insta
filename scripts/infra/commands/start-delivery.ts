import type { createCompose } from "./compose";
import { requireSuccess } from "./compose";
/** Запускает optional provider без health gate и заново поручает bootstrap Docker retry job; auth/Mongo не зависят от результата bootstrap. */
export const startDeliveryInfrastructure = async ({
  compose,
  build,
}: Readonly<{ compose: ReturnType<typeof createCompose>; build: boolean }>) => {
  requireSuccess(
    await compose.run(["up", "--detach", "--no-deps", "dragonfly-delivery"]),
  );
  requireSuccess(
    await compose.run([
      "up",
      "--detach",
      "--no-deps",
      "--force-recreate",
      build ? "--build" : "--no-build",
      "delivery-broker-init",
    ]),
  );
};
