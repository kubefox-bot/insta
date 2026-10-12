import { SUBJECT_SEPARATOR } from "./conts.ts";
import type { ParsedSubject } from "./types.ts";

/**
 * Разделяет subject по первому настроенному разделителю; распознаёт lowercase type и необязательный scope, не проверяя допустимость type и описания.
 */
export const parseCommitMessage = (value: string): ParsedSubject => {
  const separatorIndex = value.indexOf(SUBJECT_SEPARATOR);
  const hasConventionalFormat = separatorIndex !== -1;
  const prefix = hasConventionalFormat ? value.slice(0, separatorIndex) : "";
  const prefixMatch = prefix.match(/^([a-z]+)(\(([^()]+)\))?$/);
  return {
    value,
    hasConventionalFormat,
    prefix,
    type: prefixMatch?.[1] ?? "",
    scope: prefixMatch?.[3] ?? "",
    description: hasConventionalFormat
      ? value.slice(separatorIndex + SUBJECT_SEPARATOR.length)
      : "",
  };
};
