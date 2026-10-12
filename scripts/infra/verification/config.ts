import { z } from "zod";
import { readInfraConfig } from "../config";
/** Требует изолированное имя insta-docker-* и три точных sha256 image ID из окружения для lifecycle-проверки. Валидирует форму идентичности, но не наличие image и не соответствие исходникам. */
export const readLifecycleConfig = () => {
  const infrastructure = readInfraConfig();
  if (!/^insta-docker-[a-z0-9-]+$/.test(infrastructure.project))
    throw new Error(
      "Lifecycle verification requires an isolated insta-docker-* project",
    );
  return {
    infrastructure,
    images: z
      .object({
        frontend: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        backend: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        testhost: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .parse({
        frontend: Bun.env.INSTA_VERIFY_FE_IMAGE,
        backend: Bun.env.INSTA_VERIFY_BE_IMAGE,
        testhost: Bun.env.INSTA_VERIFY_TESTHOST_IMAGE,
      }),
  };
};
