type LocalMediaSource =
  | "self"
  | "blob:"
  | `https://localhost${"" | `:${number}`}`;

/**
 * Разрешает media из текущего origin и blob preview; при локальном realtime origin
 * добавляет его в CSP. Ожидает уже проверенный localhost HTTPS origin.
 */
export const createMediaSourceDirective = (
  realtimeOrigin?: string,
): LocalMediaSource[] => [
  "self",
  "blob:",
  ...(realtimeOrigin
    ? [realtimeOrigin as `https://localhost${"" | `:${number}`}`]
    : []),
];
