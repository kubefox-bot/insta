import { faroProtocol } from "../../apps/fe-insta/src/lib/observability/client/index";
import { acceptTelemetryReceipt } from "./accept";
import type { decodeTelemetryReceipt } from "./receipt";
/** Создаёт обработчик с собственным буфером кратких receipts в памяти. GET /receipts читает этот буфер, OPTIONS /collect сообщает протокол, POST передаётся валидатору; срок жизни буфера совпадает с обработчиком. */
export const createTelemetryReceiver = () => {
  const receipts: ReturnType<typeof decodeTelemetryReceipt>[] = [];
  return async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === "/receipts" && request.method === "GET")
      return Response.json({ receipts });
    if (path === "/collect" && request.method === "OPTIONS")
      return Response.json({ protocol: faroProtocol });
    if (request.method !== "POST") return new Response(null, { status: 404 });
    return acceptTelemetryReceipt({ request, receipts });
  };
};
