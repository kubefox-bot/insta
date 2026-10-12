import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import { httpHeaderNames } from "@insta/contracts/http";
import { sendMessage } from "../../../../lib/api/generated/clients/sendMessage";
import {
  createTransport,
  type RequestContext,
  readResponse,
  requestContextHeaders,
} from "../../../../lib/api/server/index";
import type { readRuntimeConfig } from "../../../../lib/config/server/index";
import { signClientSource } from "../../../../lib/http/server/index";
import { upstreamUnavailableStatus } from "../conts";
import type { SendBackend } from "../ports/backend";
import { decodeBackendSend } from "./lib/decode-send";
/** Создаёт отправитель Nest REST с подписью источника, контекстом и ключом идемпотентности. Сбой транспорта или разбора означает неизвестный исход отправки, а не доказанный отказ. */
export const createSendBackend = ({
  config,
  context,
  source,
}: Readonly<{
  config: ReturnType<typeof readRuntimeConfig>;
  context: RequestContext;
  source: () => Promise<string>;
}>): SendBackend => {
  const client = createTransport(config.api);
  return async ({ accessToken, conversationId, payload, key }) => {
    try {
      const signed = await signClientSource({
        source: await source(),
        key: config.bffSourceSigningKey,
        now: Date.now(),
        method: "POST",
        pathname: `/v1/conversations/${conversationId}/messages`,
      });
      const response = await sendMessage(
        conversationId,
        payload,
        key ? { [httpHeaderNames.idempotencyKey]: key } : undefined,
        {
          client,
          headers: {
            ...signed,
            authorization: `Bearer ${accessToken}`,
            ...requestContextHeaders(context),
          },
        },
      );
      const raw: unknown = JSON.parse(
        await readResponse({ response, ...config.api }),
      );
      return decodeBackendSend({ response, raw });
    } catch {
      return Result.Error({
        code: CommonErrorCode.OperationOutcomeUnknown,
        status: upstreamUnavailableStatus,
      });
    }
  };
};
