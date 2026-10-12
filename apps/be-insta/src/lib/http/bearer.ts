/** Извлекает токен только из строкового Bearer-заголовка; неподдержанный формат даёт пустую строку для последующей авторизации. */
export const readBearerToken = ({
  authorization,
}: Readonly<{ authorization: unknown }>): string =>
  typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
