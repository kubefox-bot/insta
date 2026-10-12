import { httpHeaderNames } from "@insta/contracts/http";
import {
  type RequestContext,
  requestContextHeaders,
} from "../../../../lib/api/server/index";
import type { StoryBackend } from "../ports/backend";
/** Собирает разрешённые заголовки Nest из подписи, контекста и access token; переносит ключ идемпотентности и multipart content-type только по назначению. */
export const storyHeaders = ({
  input,
  signed,
  context,
}: Readonly<{
  input: Parameters<StoryBackend>[0];
  signed: Readonly<Record<string, string>>;
  context: RequestContext;
}>) => {
  const headers = new Headers({
    ...signed,
    ...requestContextHeaders(context),
  });
  if (input.accessToken)
    headers.set("authorization", `Bearer ${input.accessToken}`);
  const key = input.request.headers.get(httpHeaderNames.idempotencyKey);
  if (key) headers.set(httpHeaderNames.idempotencyKey, key);
  const contentType = input.request.headers.get("content-type");
  if (input.operation === "publish" && contentType)
    headers.set("content-type", contentType);

  return headers;
};
