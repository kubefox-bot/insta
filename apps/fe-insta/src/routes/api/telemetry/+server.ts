import type { RequestHandler } from "@sveltejs/kit";
import { receiveTelemetry } from "../../../app/observability/server/intake/index.ts";
/** Получает серверный telemetry source и передаёт client-протокол intake вместе с операцией чтения актуального согласия. Маршрут не принимает consent из присланного события как доверенный. */
export const POST: RequestHandler = async ({ request, locals }) =>
  receiveTelemetry({
    request,
    readPreference: locals.readPrivacy,
    source: await locals.telemetrySource(),
    protocol: "client",
  });
