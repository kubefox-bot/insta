import type { RequestContext } from "../../../lib/api/server/index";
import type { CookieRequest } from "../../../lib/http/server/index";
import type { SessionDependencies } from "../../../lib/session/server/index";
export type AuthRequest = CookieRequest;
export type AuthTransportDependencies = Readonly<{
  sessions: SessionDependencies;
  cookieKey: Uint8Array;
  context: RequestContext;
  backend: ReturnType<typeof import("./adapters/backend").createAuthBackend>;
}>;
