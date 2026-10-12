import type { z } from "zod";
import type { testResultSchema } from "./schema";

export type TestResult = z.infer<typeof testResultSchema>;
export type OwnedResource = {
  readonly kind: "container" | "volume" | "network";
  readonly id: string;
};
export type AcceptanceConfig = ReturnType<
  typeof import("./config")["readAcceptanceConfig"]
>;
