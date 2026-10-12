import type { z } from "zod";
import type { realtimeConfigSchema } from "./schema";

export type RealtimeConfig = z.infer<typeof realtimeConfigSchema>;
