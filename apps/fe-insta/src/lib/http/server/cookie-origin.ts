/**
 * Допускает cookie-authenticated mutation только при точном совпадении Origin с origin
 * BFF. Отсутствующий Origin также отклоняется.
 */
export const acceptsCookieMutation = ({
  request,
  origin,
}: Readonly<{ request: Request; origin: string }>) =>
  request.headers.get("origin") === origin;
