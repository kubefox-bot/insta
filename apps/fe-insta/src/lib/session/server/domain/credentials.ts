import type { Binding, RefreshCredentials } from "../types";
/** Проверяет неизменность пользователя, backend-сессии и абсолютного срока при ротации. Новые сроки должны укладываться в исходную сессию и оставаться актуальными; входные credentials не изменяются. */
export const acceptsRefreshCredentials = ({
  binding,
  credentials,
  now,
}: Readonly<{
  binding: Binding;
  credentials: RefreshCredentials;
  now: number;
}>) =>
  credentials.user.id === binding.user.id &&
  credentials.backendSessionId === binding.backendSessionId &&
  credentials.absoluteExpiresAt === binding.absoluteExpiresAt &&
  credentials.expiresAt <= binding.absoluteExpiresAt &&
  credentials.expiresAt > now &&
  credentials.accessExpiresAt <= credentials.expiresAt;
