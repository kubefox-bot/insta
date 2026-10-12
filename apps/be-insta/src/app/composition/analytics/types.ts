import type { createAnalyticsDependencies } from "./create";
export type AnalyticsDependencies = ReturnType<
  typeof createAnalyticsDependencies
> &
  Readonly<{ receiver?: string | undefined }>;
