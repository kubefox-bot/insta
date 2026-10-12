import { AuthErrorCode } from "@insta/contracts/errors";
export const authBusinessCatalog = {
  registration: {
    operation: "registration.complete",
    code: "USER_ACTIVATED",
    goal: "registration_completed",
  },
  login: {
    operation: "auth.login",
    code: "SESSION_CREATED",
    goal: "login_completed",
  },
  logout: {
    operation: "auth.logout",
    code: AuthErrorCode.SessionRevoked,
    goal: "logout_completed",
  },
  refresh: {
    operation: "internal.auth.refresh",
    code: "SESSION_ROTATED",
    goal: null,
  },
} as const;
