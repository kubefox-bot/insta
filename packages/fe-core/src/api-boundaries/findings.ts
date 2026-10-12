import { apiBoundaryScopedExceptionRules } from "./conts.ts";
import { normalizePath } from "./source-paths.ts";
import type {
  ApiBoundaryConfig,
  ApiBoundaryFinding,
  ApiBoundaryRule,
  ApiBoundaryScopedExceptionRule,
} from "./types.ts";

/**
 * Сужает код правила до фиксированного списка, для которого конфигурация разрешает точечные исключения.
 */
const isScopedExceptionRule = (
  rule: ApiBoundaryRule,
): rule is ApiBoundaryScopedExceptionRule =>
  apiBoundaryScopedExceptionRules.includes(
    rule as ApiBoundaryScopedExceptionRule,
  );

/**
 * Проверяет одновременно поддерживаемое правило и точное нормализованное имя exception-файла; glob-исключения не применяются.
 */
const allowsRule = (
  config: ApiBoundaryConfig,
  path: string,
  rule: ApiBoundaryRule,
): boolean => {
  if (!isScopedExceptionRule(rule)) return false;
  return (
    config.scopedExceptionFiles?.some(
      (exception) =>
        normalizePath(exception.path) === path &&
        exception.allowedRules.includes(rule),
    ) ?? false
  );
};

/**
 * Добавляет находку в принадлежащий вызывающему список, если для пары path/rule нет разрешённого scoped exception.
 */
export const addFinding = (
  findings: ApiBoundaryFinding[],
  config: ApiBoundaryConfig,
  value: ApiBoundaryFinding,
): void => {
  if (!allowsRule(config, value.path, value.rule)) {
    findings.push(value);
  }
};
