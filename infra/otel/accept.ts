import { receiverPolicy } from "./conts";
import { decodeTelemetryReceipt } from "./receipt";
/** Читает тело целиком, затем проверяет размер и JSON/schema. Успешный receipt добавляет в переданный изменяемый буфер с вытеснением старейшего; возвращает 413/400 при отклонении. Ошибка чтения тела остаётся rejection. */
export const acceptTelemetryReceipt = async ({
  request,
  receipts,
}: Readonly<{
  request: Request;
  receipts: ReturnType<typeof decodeTelemetryReceipt>[];
}>) => {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > receiverPolicy.maximumBytes)
    return new Response(null, { status: 413 });
  try {
    const payload: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    const receipt = decodeTelemetryReceipt({
      path: new URL(request.url).pathname,
      payload,
    });
    if (!receipt) return new Response(null, { status: 400 });
    receipts.push(receipt);
    if (receipts.length > receiverPolicy.maximumReceipts) receipts.shift();
    return Response.json({});
  } catch {
    return new Response(null, { status: 400 });
  }
};
