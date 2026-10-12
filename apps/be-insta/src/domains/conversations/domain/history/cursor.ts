import { z } from "zod";
import { historyPolicy } from "./conts";
import type { Cursor } from "./types";
export const sequenceSchema = z
  .number()
  .int()
  .nonnegative()
  .max(historyPolicy.maxSequence);
export const cursorSchema = z
  .strictObject({
    direction: z.enum(["after", "before"]),
    conversationId: z.string().regex(/^[a-f0-9]{24}$/),
    sequence: sequenceSchema,
    watermark: sequenceSchema,
  })
  .refine((cursor) => cursor.sequence <= cursor.watermark);
/**
 * Валидирует границы cursor и кодирует канонический JSON в base64url; некорректное
 * внутреннее значение вызывает ошибку.
 */
export const encodeCursor = (cursor: Cursor) =>
  Buffer.from(JSON.stringify(cursorSchema.parse(cursor))).toString("base64url");
/**
 * Принимает только канонический base64url cursor своей беседы с валидными
 * sequence/watermark; любой malformed или чужой cursor возвращает null.
 */
export const decodeCursor = ({
  value,
  conversationId,
}: Readonly<{ value: string; conversationId: string }>) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (
      cursor.conversationId !== conversationId ||
      encodeCursor(cursor) !== value
    )
      return null;
    return cursor;
  } catch {
    return null;
  }
};
