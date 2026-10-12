import { z } from "zod";
import { sequenceSchema } from "../../../domain/history/cursor";
import { conversationPolicy } from "../../../domain/policy";
import { unsignedDecimalPattern } from "../conts";

/**
 * Преобразует только ограниченную десятичную строку safe integer; неподходящий ввод
 * оставляет исходным для отказа последующей Zod-проверки.
 */
const readSequence = (value: unknown) => {
  if (typeof value !== "string") return value;
  const maximum = String(conversationPolicy.maxSequence);
  if (value.length > maximum.length || !unsignedDecimalPattern.test(value))
    return value;
  if (value.length === maximum.length && value > maximum) return value;
  return Number(value);
};
export const sequenceQuerySchema = z.preprocess(readSequence, sequenceSchema);
