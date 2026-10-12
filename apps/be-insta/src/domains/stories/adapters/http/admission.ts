import { CommonErrorCode } from "@insta/contracts/errors";
import type { ClientSourceReader } from "@insta/contracts/http";
import { HttpStatus } from "@nestjs/common";
import { feedPolicy } from "../../domain/feed/conts";
import type { StoryNativeRequest, StoryReadDependencies } from "./types";
/**
 * Определяет доверенный источник и расходует отдельную квоту feed/playback; чтение
 * допускается только при явном allowed.
 */
export const admitStoryRead = async (
  input: Readonly<{
    operation: "feed" | "playback";
    headers: Readonly<Record<string, unknown>>;
    request: StoryNativeRequest;
    source: ClientSourceReader;
    reads: StoryReadDependencies;
  }>,
) => {
  const source = input.source({
    headers: input.headers,
    peer: input.request.socket.remoteAddress ?? "unknown",
    method: input.request.method,
    pathname: input.request.path,
  });
  const quota = await input.reads.quotas[input.operation].consume(source);
  return quota.isOk() && quota.get() === "allowed";
};
/**
 * Отображает недоступность чтения в 503 с Retry-After и переданным либо стандартным кодом
 * ошибки.
 */
export const readUnavailable = (
  input: Readonly<{
    response: import("../../../../lib/http/index").NativeResponse;
    meta: Readonly<{ requestId: string }>;
    code?: string;
  }>,
) => {
  input.response.status(HttpStatus.SERVICE_UNAVAILABLE);
  input.response.setHeader("Retry-After", String(feedPolicy.retryAfterSeconds));
  const code = input.code ?? CommonErrorCode.DependencyUnavailable;
  return { ok: false, error: { code, message: code }, meta: input.meta };
};
