import {
  inspectRequestLimits,
  type RequestLimitOptions,
  requestLimitModes,
} from "../../../../lib/http/server/index";
import { telemetryPostRouteIds } from "./conts";

/**
 * Оставляет чтение POST body Stories и telemetry их специализированным владельцам; остальные
 * маршруты получают общую политику лимитов.
 */
const readRequestLimitPolicy = ({
  method,
  routeId,
}: Readonly<{
  method: string;
  routeId: string | null;
}>): RequestLimitOptions => ({
  mode:
    method === "POST" &&
    (routeId === "/api/stories" ||
      telemetryPostRouteIds.some((route) => route === routeId))
      ? requestLimitModes.owningBody
      : requestLimitModes.generic,
});

/**
 * Проверяет HTTP-лимиты с политикой конкретного route, сохраняя специализированным body
 * handlers право читать свой поток.
 */
export const inspectRequestForRoute = ({
  request,
  route,
}: Readonly<{ request: Request; route: Readonly<{ id: string | null }> }>) =>
  inspectRequestLimits(
    request,
    readRequestLimitPolicy({ method: request.method, routeId: route.id }),
  );
