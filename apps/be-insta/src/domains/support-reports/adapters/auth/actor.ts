import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import { type AuthDependencies, authorizeSession } from "../../../users/index";
import type { SupportDependencies } from "../../ports/dependencies";

/**
 * Подключает публичную проверку пользовательской сессии к support; отказ авторизации и
 * сбои отображает в support identity unavailable.
 */
export const createSupportActor =
  (
    auth: Pick<AuthDependencies, "sessions" | "tokens" | "clock">,
  ): SupportDependencies["actor"] =>
  async (token) => {
    try {
      const result = await authorizeSession({ accessToken: token }, auth);
      return result.isOk()
        ? Result.Ok(result.get().userId)
        : Result.Error(SupportErrorCode.SupportIdentityUnavailable);
    } catch {
      return Result.Error(SupportErrorCode.SupportIdentityUnavailable);
    }
  };
