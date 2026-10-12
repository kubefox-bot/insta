import type { z } from "zod";
import type { storyPolicySchema } from "./policy";
export type StoryRuntimePolicy = Readonly<z.infer<typeof storyPolicySchema>>;
