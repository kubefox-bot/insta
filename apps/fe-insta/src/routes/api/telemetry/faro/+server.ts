import type { RequestHandler } from "@sveltejs/kit";
import {
  receiveTelemetry,
  telemetryEnabled,
} from "../../../../app/observability/server/intake/index.ts";
/** Возвращает разрешённость Faro и revision/policyVersion подготовленного privacy preference с no-store; изменение согласия не выполняется. */
export const GET: RequestHandler = async ({ locals }) =>
  Response.json(
    {
      enabled: await telemetryEnabled(locals.privacy),
      revision: locals.privacy.revision,
      policyVersion: locals.privacy.policyVersion,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
/** Передаёт Faro intake исходный request, серверный source и чтение актуального privacy preference; решение о приёме событий остаётся у intake. */
export const POST: RequestHandler = async ({ request, locals }) =>
  receiveTelemetry({
    request,
    readPreference: locals.readPrivacy,
    source: await locals.telemetrySource(),
    protocol: "faro",
  });
