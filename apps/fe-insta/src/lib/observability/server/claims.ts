import { intakePolicy } from "../client/conts";

/**
 * Удаляет из переданной изменяемой карты claims с истёкшим сроком по внедрённому
 * времени; остальные записи сохраняет.
 */
const expireClaims = ({
  claims,
  now,
}: Readonly<{ claims: Map<string, number>; now: number }>) => {
  for (const [key, expiresAt] of claims)
    if (expiresAt <= now) claims.delete(key);
};
/**
 * Возвращает локальный детектор повторов: новый id сразу получает claim до внешнего
 * эффекта, повтор даёт true. Истёкшие claims удаляются, при заполнении вытесняется
 * самый ранний добавленный; это ограниченная память, а не гарантия exactly-once.
 */
export const createClientClaims = (clock: () => number) => {
  const claims = new Map<string, number>();
  return (id: string) => {
    const now = clock();
    expireClaims({ claims, now });
    if (claims.has(id)) return true;
    const oldest =
      claims.size >= intakePolicy.maximumClaims
        ? claims.keys().next().value
        : undefined;
    if (oldest) claims.delete(oldest);
    claims.set(id, now + intakePolicy.claimLifetimeMs);
    return false;
  };
};
