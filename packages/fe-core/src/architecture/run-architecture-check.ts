import { checkArchitecture } from "./check-architecture.ts";
import type { ArchitectureConfig, ArchitectureResult } from "./types.ts";

/**
 * Публичный запуск архитектурной проверки; передаёт конфигурацию и cwd владельцу анализа, сохраняя результат и ошибки.
 */
export const runArchitectureCheck = (
  config: ArchitectureConfig,
  options?: { cwd?: string },
): Promise<ArchitectureResult> => checkArchitecture(config, options);
