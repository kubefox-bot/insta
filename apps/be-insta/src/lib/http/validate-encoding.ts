import { createValidationException } from "./validation-error";
/** Отклоняет некорректный UTF-8 до разбора JSON, сохраняя исходную ошибку только в cause. */
export const validateJsonEncoding = (buffer: Uint8Array) => {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (cause) {
    const error = createValidationException([
      { path: [], message: "Invalid JSON encoding" },
    ]);
    error.cause = cause;
    throw error;
  }
};
