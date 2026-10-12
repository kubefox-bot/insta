import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import {
  type RequestContext,
  readResponse,
} from "../../../../lib/api/server/index";
import type { readRuntimeConfig } from "../../../../lib/config/server/index";
import { signClientSource } from "../../../../lib/http/server/index";
import { storyTransport } from "../conts";
import type { StoryBackend } from "../ports/backend";
import type { StoryBackendFailure } from "../ports/types";
import { boundedStoryBody } from "./body";
import { decodeStoryReply } from "./decode";
import { storyHeaders } from "./headers";
import { storyTarget } from "./target";
/** Создаёт серверный REST-адаптер Stories с подписью источника и ограничением тела загрузки. Поток передаётся одному fetch без повторов; отмена, таймаут и ошибки чтения означают неизвестный исход. */
export const createStoryBackend =
  ({
    config,
    context,
    source,
  }: Readonly<{
    config: ReturnType<typeof readRuntimeConfig>;
    context: RequestContext;
    source: () => Promise<string>;
  }>): StoryBackend =>
  async (input) => {
    const { pathname, method, target } = storyTarget({
      input,
      baseURL: config.api.baseURL,
    });
    try {
      const body: Result<
        ReadableStream<Uint8Array> | undefined,
        StoryBackendFailure
      > =
        method === "POST"
          ? boundedStoryBody(input.request)
          : Result.Ok(undefined);
      if (body.isError()) return Result.Error(body.getError());
      const signed = await signClientSource({
        source: await source(),
        key: config.bffSourceSigningKey,
        now: Date.now(),
        method,
        pathname,
      });
      const headers = storyHeaders({ input, signed, context });
      // Raw streams have one owner and zero retries. Session refresh cannot replay POST.
      const response = await fetch(target, {
        method,
        headers,
        body: body.get(),
        signal: AbortSignal.any([
          input.request.signal,
          AbortSignal.timeout(storyTransport.requestMs),
        ]),
        redirect: "error",
      });
      const raw: unknown = JSON.parse(
        await readResponse({ response, ...config.api }),
      );
      return decodeStoryReply({ response, raw, operation: input.operation });
    } catch {
      return Result.Error({
        code: CommonErrorCode.OperationOutcomeUnknown,
        status: storyTransport.unavailable,
      });
    }
  };
