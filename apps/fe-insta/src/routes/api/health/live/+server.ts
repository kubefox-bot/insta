import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { livenessBody } from "./conts";

/** Возвращает фиксированный liveness-ответ с no-store без проверки зависимостей; hook разрешает этот точный маршрут в обход подготовки application request. */
export const GET = (() =>
  json(livenessBody, {
    headers: { "Cache-Control": "no-store" },
  })) satisfies RequestHandler;
