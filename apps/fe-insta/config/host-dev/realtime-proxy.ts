import type { ProxyOptions } from "vite";
import { localHMRHost } from "./conts.ts";

type RealtimeProxyRequest = Readonly<{
  readonly headers: Readonly<Record<string, unknown>>;
  readonly rawHeaders: readonly string[];
}>;

/**
 * Принимает только канонический host[:port] без пробелов, credentials и URL-хвоста.
 * Возвращает отсутствие для неоднозначного authority, чтобы proxy отказал в допуске.
 */
const normalizeAuthority = (authority: string) => {
  if (authority.trim() !== authority) return undefined;
  try {
    const url = new URL(`https://${authority}`);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      authority.toLowerCase() !== url.host
    )
      return undefined;
    return url.host;
  } catch {
    return undefined;
  }
};

/**
 * Сверяет raw и нормализованные Host/:authority, отклоняя дубликаты и расхождения.
 * Возвращает единственный проверенный authority для проверки локального proxy.
 */
const requestAuthority = (request: RealtimeProxyRequest) => {
  if (request.rawHeaders.length % 2 !== 0) return undefined;
  const rawAuthorities = request.rawHeaders.flatMap((header, index) => {
    if (index % 2 !== 0) return [];
    const name = header.toLowerCase();
    return name === "host" || name === ":authority"
      ? [request.rawHeaders[index + 1]]
      : [];
  });
  const mappedAuthorities = [
    request.headers.host,
    request.headers[":authority"],
  ].filter((value) => value !== undefined);
  if (
    rawAuthorities.length > 1 ||
    mappedAuthorities.length > 1 ||
    mappedAuthorities.some((value) => typeof value !== "string")
  )
    return undefined;
  const rawAuthority = rawAuthorities[0];
  const mappedAuthority = mappedAuthorities[0];
  if (rawAuthority !== undefined && typeof rawAuthority !== "string")
    return undefined;
  if (
    rawAuthority !== undefined &&
    mappedAuthority !== undefined &&
    normalizeAuthority(rawAuthority) !==
      normalizeAuthority(mappedAuthority as string)
  )
    return undefined;
  const authority = rawAuthority ?? mappedAuthority;
  return typeof authority === "string"
    ? normalizeAuthority(authority)
    : undefined;
};

/**
 * Выделяет WSS HMR отдельный порт на localhost. Отсутствующий frontend port или его
 * совпадение с HMR останавливают конфигурацию.
 */
export const createLocalViteWebSocketConfiguration = ({
  frontendOrigin,
  hmrPort,
}: Readonly<{ frontendOrigin: string; hmrPort: number }>) => {
  const frontendUrl = new URL(frontendOrigin);
  if (!frontendUrl.port)
    throw new Error("Local frontend origin must include its Vite port");
  if (Number(frontendUrl.port) === hmrPort)
    throw new Error("Local frontend HMR port must differ from its Vite port");
  return {
    host: localHMRHost,
    protocol: "wss",
    port: hmrPort,
    clientPort: hmrPort,
  } as const;
};

/**
 * Заменяет Origin исходящего proxy-запроса на доверенный realtime origin. Изменяет
 * переданный HTTP-запрос после проверки входящего браузерного origin.
 */
export const rewriteRealtimeProxyOrigin = ({
  request,
  origin,
}: Readonly<{
  request: Readonly<{ setHeader: (name: string, value: string) => unknown }>;
  origin: string;
}>) => request.setHeader("origin", origin);

/**
 * Допускает запрос только к ожидаемому frontend authority и origin. WebSocket требует
 * Origin; запрос без Origin допускается лишь с same-origin Fetch Metadata.
 */
export const acceptsRealtimeProxyRequest = ({
  request,
  frontendOrigin,
}: Readonly<{
  request: RealtimeProxyRequest;
  frontendOrigin: string;
}>) => {
  const origin = request.headers.origin;
  const isWebSocket = request.headers.upgrade !== undefined;
  if (origin !== undefined && origin !== frontendOrigin) return false;
  if (origin === undefined && isWebSocket) return false;
  if (
    origin === undefined &&
    request.headers["sec-fetch-site"] !== "same-origin"
  )
    return false;
  return requestAuthority(request) === new URL(frontendOrigin).host;
};

/**
 * Создаёт Vite proxy для realtime HTTP и WS с проверкой входящего origin и его заменой
 * при пересылке. Регистрацией и временем жизни proxy владеет Vite.
 */
export const createRealtimeProxy = ({
  path,
  target,
  frontendOrigin,
  realtimeOrigin,
}: Readonly<{
  path: string;
  target: string;
  frontendOrigin: string;
  realtimeOrigin: string;
}>) => ({
  [path]: {
    target,
    changeOrigin: true,
    ws: true,
    /**
     * Отклоняет чужой или неоднозначный origin/authority до пересылки; undefined
     * оставляет разрешённый запрос стандартному proxy Vite.
     */
    bypass: (request) =>
      acceptsRealtimeProxyRequest({ request, frontendOrigin })
        ? undefined
        : false,
    /**
     * Подключает замену Origin к HTTP и WebSocket исходящим запросам. Обработчики живут
     * вместе с proxy Vite.
     */
    configure: (
      proxy: Parameters<NonNullable<ProxyOptions["configure"]>>[0],
    ) => {
      /**
       * Устанавливает выбранный realtime origin в исходящий запрос обоих
       * proxy-протоколов.
       */
      const rewriteOrigin = (
        request: Parameters<typeof rewriteRealtimeProxyOrigin>[0]["request"],
      ) => rewriteRealtimeProxyOrigin({ request, origin: realtimeOrigin });
      proxy.on("proxyReq", rewriteOrigin);
      proxy.on("proxyReqWs", rewriteOrigin);
    },
  } satisfies ProxyOptions,
});
