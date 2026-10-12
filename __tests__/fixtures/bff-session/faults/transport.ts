import type { AuthRequest } from "../../../../apps/fe-insta/src/domains/users/server/index";
import { sessionRequest } from "../../../../apps/fe-insta/src/domains/users/server/session/index";
import type { SessionDependencies } from "../../../../apps/fe-insta/src/lib/session/server/index";
import { asLogoutFormReceipt } from "./action";
export const faultSessionResponse = async ({
  input,
  path,
  cookies,
  sessions,
  cookieKey,
}: {
  readonly input: Request;
  readonly path: string;
  readonly cookies: AuthRequest["cookies"];
  readonly sessions: SessionDependencies;
  readonly cookieKey: Uint8Array;
}) => {
  const context = { requestId: crypto.randomUUID() };
  const backend = {
    login: async () => {
      throw new Error("Fault session adapter does not own login");
    },
  };
  const request = new Request("https://localhost/api/session", {
    method: path === "/logout" || path === "/logout-form" ? "POST" : "GET",
    headers: input.headers,
  });
  const response = await sessionRequest(
    { request, origin: "https://localhost", cookies },
    { sessions, backend, context, cookieKey },
  );
  if (path !== "/logout-form") return response;
  return asLogoutFormReceipt(response);
};
