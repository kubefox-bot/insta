import type { StoryBackend } from "../ports/backend";
/** Выбирает REST-путь и метод операции, кодирует id и переносит query только для чтения ленты. */
export const storyTarget = ({
  input,
  baseURL,
}: Readonly<{ input: Parameters<StoryBackend>[0]; baseURL: string }>) => {
  const suffix = {
    publish: "",
    feed: "",
    publication: `/publications/${encodeURIComponent(input.id ?? "")}`,
    playback: `/${encodeURIComponent(input.id ?? "")}/playback`,
  }[input.operation];
  const pathname = `/v1/stories${suffix}`;
  const method = input.operation === "publish" ? "POST" : "GET";
  const target = new URL(pathname, baseURL);
  if (input.operation === "feed")
    target.search = new URL(input.request.url).search;
  return { pathname, method, target };
};
