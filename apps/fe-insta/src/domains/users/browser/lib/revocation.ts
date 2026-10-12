import { z } from "zod";

const schema = z.object({ revocation: z.enum(["pending", "confirmed"]) });
/**
 * Извлекает подтверждённое схемой состояние отзыва из action-ответа; неизвестный payload
 * оставляет без revocation.
 */
export const readRevocation = (data: unknown) => {
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data.revocation : undefined;
};
