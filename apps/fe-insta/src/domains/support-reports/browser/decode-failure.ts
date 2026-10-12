import { z } from "zod";
import type { SupportFailure } from "../domain/types";
import { supportFailureCodes, supportWireErrors } from "./conts";
import { supportErrorSchema } from "./receipt";

const codeSchema = z.enum(supportWireErrors);
/**
 * Переводит известные wire-коды поддержки в состояния формы; неизвестная или неверная
 * структура остаётся неопределённым исходом.
 */
export const decodeSupportFailure = (input: unknown): SupportFailure => {
  const parsed = supportErrorSchema.safeParse(input);
  if (!parsed.success) return "unknown";
  const code = codeSchema.safeParse(parsed.data.error.code);
  return code.success ? supportFailureCodes[code.data] : "unknown";
};
