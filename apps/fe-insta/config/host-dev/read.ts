import { z } from "zod";
import {
  apiBaseUrlKey,
  localApiOriginPolicy,
  localFrontendMarker,
  localHMRPortKey,
  localOriginPolicy,
  maxLocalPort,
  originKey,
  realtimeOriginKey,
} from "./conts.ts";

const localHttpsOrigin = z.url().refine((origin) => {
  const url = new URL(origin);
  return (
    url.origin === origin &&
    url.protocol === localOriginPolicy.protocol &&
    url.hostname === localOriginPolicy.hostname
  );
});

const localViteOrigin = localHttpsOrigin.refine((origin) =>
  Boolean(new URL(origin).port),
);

const localApiOrigin = z.url().refine((origin) => {
  const url = new URL(origin);
  return (
    url.origin === origin &&
    url.protocol === localApiOriginPolicy.protocol &&
    localApiOriginPolicy.hostnames.some((hostname) => hostname === url.hostname)
  );
});

/**
 * Читает необязательный host-dev origin и проверяет канонический HTTPS localhost.
 * Некорректная настройка вызывает ошибку без раскрытия входного значения.
 */
export const readHostDevOrigin = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) => {
  const value = raw[originKey];
  if (value === undefined) return undefined;
  const result = localHttpsOrigin.safeParse(value);
  if (!result.success)
    throw new Error(
      "Invalid host dev origin: expected a canonical HTTPS localhost origin",
    );
  return result.data;
};

/**
 * Включает host-dev только по точному маркеру и проверяет API/frontend/realtime origins и
 * отдельный HMR port. Без маркера возвращает отсутствие; некорректные настройки прерывают
 * запуск.
 */
export const readLocalFrontendServerConfiguration = (
  raw: Readonly<Record<string, string | undefined>> = Bun.env,
) => {
  if (raw[localFrontendMarker] === undefined) return undefined;
  if (raw[localFrontendMarker] !== "1")
    throw new Error("Invalid local frontend Vite configuration");
  const result = z
    .object({
      apiBaseUrl: localApiOrigin,
      frontendOrigin: localViteOrigin,
      hmrPort: z.coerce.number().int().positive().max(maxLocalPort),
      realtimeOrigin: localHttpsOrigin,
    })
    .safeParse({
      apiBaseUrl: raw[apiBaseUrlKey],
      frontendOrigin: raw[originKey],
      hmrPort: raw[localHMRPortKey],
      realtimeOrigin: raw[realtimeOriginKey],
    });
  if (!result.success)
    throw new Error("Invalid local frontend Vite configuration");
  if (Number(new URL(result.data.frontendOrigin).port) === result.data.hmrPort)
    throw new Error("Invalid local frontend Vite configuration");
  return result.data;
};
