import {
  readRequiredString,
  readStringArray,
} from "../lib/configuration/index.ts";
import type { ArchitectureConfig } from "./types.ts";
import { validateOwnerFiles } from "./validate-config.ts";

/**
 * Проверяет внешний JSON и поддерживаемые mode/preset, затем нормализует поля конфигурации; неверные значения бросают TypeError, существование owner-файлов здесь не проверяется.
 */
export const parseArchitectureConfig = (value: unknown): ArchitectureConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("конфигурация должна быть JSON-объектом");
  }
  const config = value as Record<string, unknown>;
  if (
    config.mode !== undefined &&
    config.mode !== "warn" &&
    config.mode !== "strict"
  ) {
    throw new TypeError("mode должен быть warn или strict");
  }
  if (
    config.resultBoundary !== undefined &&
    typeof config.resultBoundary !== "string"
  ) {
    throw new TypeError("resultBoundary должен быть строкой");
  }
  if (
    config.preset !== undefined &&
    config.preset !== "domain-first-next" &&
    config.preset !== "module-style"
  ) {
    throw new TypeError(
      "preset должен быть domain-first-next или module-style",
    );
  }

  const sourceRoot = readRequiredString(config.sourceRoot, "sourceRoot");
  return {
    disallowedExternalImports: readStringArray(
      config.disallowedExternalImports,
      "disallowedExternalImports",
    ),
    exportCountAllowlist: readStringArray(
      config.exportCountAllowlist,
      "exportCountAllowlist",
    ),
    environmentFiles: validateOwnerFiles(
      config.environmentFiles,
      "environmentFiles",
      sourceRoot,
    ),
    entrypointFiles: validateOwnerFiles(
      config.entrypointFiles,
      "entrypointFiles",
      sourceRoot,
    ),
    mode: config.mode,
    preset: config.preset,
    resultBoundary: config.resultBoundary,
    sourceRoot,
  };
};
