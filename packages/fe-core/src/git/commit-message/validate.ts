import {
  ALLOWED_TYPES,
  bootstrapCommitSubject,
  GENERIC_DESCRIPTIONS,
  MIN_DESCRIPTION_CHARACTERS,
  MIN_DESCRIPTION_WORDS,
} from "./conts.ts";
import { parseCommitMessage } from "./parse.ts";
import type { ValidationIssue } from "./types.ts";

/**
 * Собирает нарушения минимальной длины, числа слов и списка общих описаний; пустое описание даёт только description-missing.
 */
const descriptionIssues = (description: string): readonly ValidationIssue[] => {
  const trimmed = description.trim();
  if (!trimmed)
    return [
      {
        code: "description-missing",
        message: "Описание отсутствует после двоеточия.",
      },
    ];
  const words = trimmed.split(/\s+/);
  const issues: ValidationIssue[] = [];
  if (trimmed.length < MIN_DESCRIPTION_CHARACTERS)
    issues.push({
      code: "description-short",
      message: `Описание слишком короткое: минимум ${MIN_DESCRIPTION_CHARACTERS} символов.`,
    });
  if (words.length < MIN_DESCRIPTION_WORDS)
    issues.push({
      code: "description-words",
      message: `Описание должно содержать минимум ${MIN_DESCRIPTION_WORDS} слова.`,
    });
  if (GENERIC_DESCRIPTIONS.includes(trimmed.toLowerCase()))
    issues.push({
      code: "description-generic",
      message: "Описание слишком общее: укажите конкретное изменение.",
    });
  return issues;
};

/**
 * Возвращает нарушения Conventional Commit subject и содержательности описания; отсутствие разделителя останавливает проверку формата, вход не изменяется.
 */
export const validateCommitMessage = (
  value: string,
): readonly ValidationIssue[] => {
  if (value === bootstrapCommitSubject) return [];
  const parsed = parseCommitMessage(value);
  if (!parsed.hasConventionalFormat)
    return [
      {
        code: "commit-format",
        message: "Ожидается `type: описание` или `type(scope): описание`.",
      },
    ];
  const issues: ValidationIssue[] = [];
  if (!parsed.prefix)
    issues.push({
      code: "commit-type-missing",
      message: "Type обязателен перед двоеточием.",
    });
  else if (!parsed.type)
    issues.push({
      code: "scope-format",
      message: "Неверный префикс: используйте `type` или `type(scope)`.",
    });
  else if (!(ALLOWED_TYPES as readonly string[]).includes(parsed.type))
    issues.push({
      code: "commit-type",
      message: `Допустимые type: ${ALLOWED_TYPES.join(", ")}.`,
    });
  return [...issues, ...descriptionIssues(parsed.description)];
};
