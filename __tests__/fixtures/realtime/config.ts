import { fileURLToPath } from "node:url";
import { z } from "zod";
export const readRealtimeFixtureConfig = () => ({
  sourceRoot: fileURLToPath(new URL("../../../", import.meta.url)),
  image: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional()
    .parse(Bun.env.CHAT03_TESTHOST_IMAGE),
});
