import type { readRuntimeConfig } from "../../../lib/config/index";
export type StoriesConfiguration = ReturnType<
  typeof readRuntimeConfig
>["stories"];
