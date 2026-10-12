import { Result } from "@bloodyowl/boxed";
import {
  createBinding,
  encryptSessionCookie,
  sessionCookieName,
} from "../../../../lib/session/server/index";
import type { AuthRequest, AuthTransportDependencies } from "../types";
/**
 * Создаёт серверную привязку credentials и шифрованную session cookie, возвращая только
 * публичного actor; ошибку привязки сохраняет в Result, сбой шифрования или записи cookie не
 * перехватывает.
 */
export const establishSession = async (
  {
    credentials,
    cookies,
    origin,
  }: Readonly<{
    credentials: Parameters<typeof createBinding>[0];
    cookies: AuthRequest["cookies"];
    origin: string;
  }>,
  {
    sessions,
    cookieKey,
  }: Pick<AuthTransportDependencies, "sessions" | "cookieKey">,
) => {
  const binding = await createBinding(credentials, sessions);
  if (binding.isError())
    return Result.Error<
      { userId: string; username: string; generation: string },
      ReturnType<typeof binding.getError>
    >(binding.getError());
  const established = binding.get();
  cookies.set(
    sessionCookieName,
    await encryptSessionCookie({
      bindingId: established.bindingId,
      absoluteExpiresAt: established.absoluteExpiresAt,
      key: cookieKey,
    }),
    {
      path: "/",
      httpOnly: true,
      secure: new URL(origin).protocol === "https:",
      sameSite: "lax",
      expires: new Date(established.absoluteExpiresAt),
    },
  );
  return binding.map((value) => ({
    userId: value.user.id,
    username: value.user.username,
    generation: value.backendSessionId,
  }));
};
