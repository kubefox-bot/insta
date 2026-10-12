import { CompactEncrypt, compactDecrypt } from "jose";
import { z } from "zod";
import { supportCookie } from "./conts";
export const scopeSchema = z.strictObject({
  scopeId: z.uuid(),
  proof: z.string(),
  userId: z.string().nullable(),
  expiresAt: z.number(),
});
/**
 * Шифрует scope формы вместе с аудиторией; proof и identity остаются внутри защищённой cookie.
 */
export const sealSupportScope = async (
  input: Readonly<{ scope: z.infer<typeof scopeSchema>; key: Uint8Array }>,
) =>
  new CompactEncrypt(
    new TextEncoder().encode(
      JSON.stringify({ aud: supportCookie.audience, ...input.scope }),
    ),
  )
    .setProtectedHeader({
      alg: supportCookie.algorithm,
      enc: supportCookie.encryption,
    })
    .encrypt(input.key);
/**
 * Проверяет шифрование, аудиторию, структуру и срок scope; отсутствующую, испорченную или
 * истёкшую cookie возвращает как null.
 */
export const readSupportScope = async (
  input: Readonly<{ cookie?: string; key: Uint8Array; now: number }>,
) => {
  if (!input.cookie) return null;
  try {
    const { plaintext } = await compactDecrypt(input.cookie, input.key, {
      keyManagementAlgorithms: [supportCookie.algorithm],
      contentEncryptionAlgorithms: [supportCookie.encryption],
    });
    const parsed = z
      .strictObject({
        aud: z.literal(supportCookie.audience),
        ...scopeSchema.shape,
      })
      .parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)),
      );
    const { aud: _aud, ...scope } = parsed;
    return scope.expiresAt > input.now ? scope : null;
  } catch {
    return null;
  }
};
