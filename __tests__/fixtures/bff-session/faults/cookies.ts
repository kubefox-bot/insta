import type { AuthRequest } from "../../../../apps/fe-insta/src/domains/users/server/index";
export const readOnlyCookies = (request: Request): AuthRequest["cookies"] => {
  const values = new Map(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .filter(Boolean)
      .map((entry) => {
        const split = entry.indexOf("=");
        return [entry.slice(0, split).trim(), entry.slice(split + 1)];
      }),
  );
  return {
    get: (name) => values.get(name),
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    set: () => {
      throw new Error("Session read/logout must not set cookies");
    },
    delete: () => {
      throw new Error("Session read/logout must not delete cookies");
    },
    parse: () => {
      throw new Error("Unexpected cookie parse");
    },
    serialize: () => {
      throw new Error("Session read/logout must not serialize cookies");
    },
  };
};
