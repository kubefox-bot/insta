import type { Reports } from "../ports/reports";
/**
 * Передаёт текущее время владельцу удаления просроченных отчётов; ошибку очистки
 * оставляет вызывающему worker.
 */
export const cleanupReports = (
  dependencies: Readonly<{
    reports: Pick<Reports, "cleanup">;
    clock: () => number;
  }>,
) => dependencies.reports.cleanup(dependencies.clock());
