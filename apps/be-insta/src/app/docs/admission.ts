import { documentationPaths } from "./conts";

/** Разрешает readiness bypass только для точного списка путей документации, без широкого prefix matching. */
export const isDocumentationPath = (path: string) =>
  documentationPaths.some((allowedPath) => allowedPath === path);
