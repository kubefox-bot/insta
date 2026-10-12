import type { Cookies } from "@sveltejs/kit";
import type { RequestContext } from "../../../lib/api/server/index";
import type { SessionDependencies } from "../../../lib/session/server/index";
import type { StoryBackend } from "./ports/backend";
export type StoryRequest = Readonly<{
  request: Request;
  origin: string;
  cookies: Pick<Cookies, "get">;
}>;
export type StoryRequestDependencies = Readonly<{
  backend: StoryBackend;
  session: SessionDependencies;
  cookieKey: Uint8Array;
  context: RequestContext;
}>;
