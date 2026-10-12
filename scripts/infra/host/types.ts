import type { z } from "zod";
import type { containerSchema } from "./containers";
export type ContainerState = z.infer<typeof containerSchema>[number];
