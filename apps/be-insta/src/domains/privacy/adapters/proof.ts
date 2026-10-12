import { proofBytes } from "../domain/conts";
import type { Random } from "../domain/types";
/**
 * Собирает криптографическую выдачу proof и его хеширование для хранения без исходного
 * секрета.
 */
export const createRandom = (): Random => ({
  /**
   * Создаёт случайный base64url proof контекста из системного криптографического
   * генератора.
   */
  proof: () =>
    Buffer.from(crypto.getRandomValues(new Uint8Array(proofBytes))).toString(
      "base64url",
    ),
  /**
   * Вычисляет SHA-256 proof для адресации контекста; исходный proof в результат не
   * включает.
   */
  digest: async (proof) =>
    Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(proof)),
    ).toString("hex"),
});
