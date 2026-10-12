import type { Cookies } from "@sveltejs/kit";
import type { RequestContext } from "../../../lib/api/server/index";
import type { SessionDependencies } from "../../../lib/session/server/index";
import type { SendBackend } from "./ports/backend";
export type SendRequest = Readonly<{
  request: Request;
  origin: string;
  cookies: Pick<Cookies, "get">;
  conversationId: string;
}>;
export type SendDependencies = Readonly<{
  sessions: SessionDependencies;
  cookieKey: Uint8Array;
  context: RequestContext;
  backend: SendBackend;
}>;
