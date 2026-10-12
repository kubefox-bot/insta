import { intakePolicy } from "../client/conts";
/**
 * Читает application/json с byte budget, строгим UTF-8 и JSON parsing. При превышении
 * ждёт reader.cancel; ошибка чтения, cancel или parsing даёт invalid. Reader lock
 * освобождается в finally; собственного таймера чтения здесь нет.
 */
export const readIntakePayload = async (
  request: Request,
): Promise<
  | Readonly<{ kind: "parsed"; payload: unknown }>
  | Readonly<{ kind: "invalid" | "too_large" }>
> => {
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  )
    return { kind: "invalid" };
  if (!request.body) return { kind: "invalid" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > intakePolicy.payloadBytes) {
        await reader.cancel();
        return { kind: "too_large" };
      }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      kind: "parsed",
      payload: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(body),
      ),
    };
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }
};
