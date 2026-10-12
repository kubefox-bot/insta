import type { ArchitectureFinding } from "./types.ts";

const REPORT_WIDTH = 42;
const CAP = "╱".repeat(REPORT_WIDTH);
const HR = "─".repeat(REPORT_WIDTH);

/**
 * Форматирует находки с примерами и фиксированной подписью warn-mode; сама функция режим проверки не принимает и exit code не определяет.
 */
export const formatArchitectureFindings = (
  findings: readonly ArchitectureFinding[],
): string => {
  const lines = [
    CAP,
    "❌  Архитектурные правила требуют внимания",
    HR,
    "  Проверки:",
  ];

  for (const finding of findings) {
    lines.push(`  ⚠️   ${finding.rule}: ${finding.path}`);
    lines.push(`      ${finding.message}`);
    lines.push(`      Пример: ${finding.example}`);
  }

  lines.push(
    HR,
    "  Сейчас это warn-mode: CI показывает drift, но не падает.",
    CAP,
  );
  return `${lines.join("\n")}\n`;
};
