import { Result } from "@bloodyowl/boxed";
import { acknowledgeReceipts } from "../../../../../lib/api/generated/clients/acknowledgeReceipts";
import {
  createTransport,
  type RequestContext,
  readResponse,
  requestContextHeaders,
} from "../../../../../lib/api/server/index";
import type { readRuntimeConfig } from "../../../../../lib/config/server/index";
import { signClientSource } from "../../../../../lib/http/server/index";
import { upstreamUnavailableStatus } from "../../conts";
import { receiptUnknownCode } from "../conts";
import type { ReceiptBackend } from "../types";

import { decodeReceiptResponse } from "./decode";
/** Создаёт подписанный отправитель подтверждений Nest; проверяет соответствие снимка отправленному пакету и сохраняет неизвестный исход при сбоях транспорта или разбора. */
export const createReceiptBackend = ({
  config,
  context,
  source,
}: Readonly<{
  config: ReturnType<typeof readRuntimeConfig>;
  context: RequestContext;
  source: () => Promise<string>;
}>): ReceiptBackend => {
  const client = createTransport(config.api);
  return async ({ accessToken, conversationId, payload }) => {
    /** Обозначает неопределённый результат подтверждения, когда нельзя доказать применение пакета backend. */
    const unknown = () =>
      Result.Error({
        code: receiptUnknownCode,
        status: upstreamUnavailableStatus,
      });
    try {
      const signed = await signClientSource({
        source: await source(),
        key: config.bffSourceSigningKey,
        now: Date.now(),
        method: "POST",
        pathname: `/v1/conversations/${conversationId}/receipts`,
      });
      const response = await acknowledgeReceipts(conversationId, payload, {
        client,
        headers: {
          ...signed,
          authorization: `Bearer ${accessToken}`,
          ...requestContextHeaders(context),
        },
      });
      const raw: unknown = JSON.parse(
        await readResponse({ response, ...config.api }),
      );
      return decodeReceiptResponse({
        response,
        raw,
        conversationId,
        messageIds: payload.messageIds,
      });
    } catch {
      return unknown();
    }
  };
};
