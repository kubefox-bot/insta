import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defaultHostMailpitPort, maximumHostPort } from "./conts";

export const readAuthFixtureConfig = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) => {
  const hostMailpitPort = z.coerce
    .number()
    .int()
    .min(1)
    .max(maximumHostPort)
    .default(defaultHostMailpitPort)
    .parse(raw.MAILPIT_PORT === "" ? undefined : raw.MAILPIT_PORT);
  return {
    sourceRoot: fileURLToPath(new URL("../../../", import.meta.url)),
    image: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .optional()
      .parse(raw.AUTH05_TESTHOST_IMAGE),
    hostMailpitUrl: `http://127.0.0.1:${hostMailpitPort}`,
  };
};
