import {
  loopbackHost,
  privilegedPortCeiling,
  unspecifiedIpv4Host,
} from "./conts";

/** Для привилегированных портов Darwin выбирает wildcard IPv4 probe; в остальных случаях проверяет loopback. Не открывает socket. */
export const selectProbeHost = ({
  port,
  platform,
}: {
  readonly port: number;
  readonly platform: NodeJS.Platform;
}) =>
  platform === "darwin" && port < privilegedPortCeiling
    ? unspecifiedIpv4Host
    : loopbackHost;

/** Различает занятый порт и невозможность проверки по коду ошибки, сохраняя cause. Диагностика явно оставляет существующий процесс владельцу. */
export const portProbeError = ({
  port,
  protocol,
  error,
}: {
  readonly port: number;
  readonly protocol: "TCP" | "UDP";
  readonly error: unknown;
}) => {
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : "unknown";
  const message =
    code === "EADDRINUSE"
      ? `Loopback ${protocol} port${port} is occupied; choose a free port or a separate Compose project. Existing process preserved.`
      : `Unable to check loopback ${protocol} port${port} (${code}). Existing process preserved.`;
  return new Error(message, { cause: error });
};
