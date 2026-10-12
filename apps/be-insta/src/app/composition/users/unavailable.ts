import type {
  AuthDependencies,
  AuthLimits,
} from "../../../domains/users/index";

/** Явно отклоняет вызов auth при отсутствии runtime-зависимостей вместо выдачи фиктивной сессии. */
const unavailable = (): never => {
  throw new Error("Auth dependencies unavailable");
};
export const unavailableAuth: AuthDependencies &
  Readonly<{ limits: AuthLimits }> = {
  sessions: {
    findAccount: unavailable,
    read: unavailable,
    issue: unavailable,
    rotate: unavailable,
    revoke: unavailable,
  },
  tokens: {
    secret: unavailable,
    digest: unavailable,
    matches: unavailable,
    issueAccess: unavailable,
    verifyAccess: unavailable,
    seal: unavailable,
    open: unavailable,
  },
  passwords: { hash: unavailable, verify: unavailable },
  limits: { consume: unavailable, recordChallengeError: unavailable },
  clock: Date.now,
  sessionId: unavailable,
  operationId: unavailable,
};
