import { expect } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import { createSupportEnvironment } from "../../../../../__tests__/fixtures/support/environment";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import { createApplication } from "../../../src/app/bootstrap";
import { authorizeSession } from "../../../src/domains/users/index";

const support = await createSupportEnvironment();
try {
  const users = await createAuthEnvironment();
  try {
    const app = await createApplication(
      {
        support: {
          ...support.dependencies,
          actor: async (token) => {
            const result = await authorizeSession(
              { accessToken: token },
              users.auth,
            );
            return result.isOk()
              ? Result.Ok(result.get().userId)
              : Result.Error(SupportErrorCode.SupportIdentityUnavailable);
          },
        },
        users: users.users,
        checkRequired: async () => true,
        check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
        close: async () => {},
      },
      { mode: "offline" },
    );
    try {
      await app.listen(0, "127.0.0.1");
      const url = await app.getUrl();
      const context = await (
        await fetch(`${url}/v1/support/form-context`)
      ).json();
      expect(context.ok).toBe(true);
      const me = await fetch(`${url}/v1/me`, {
        headers: { authorization: `Bearer ${context.data.proof}` },
      });
      expect(me.status).toBe(401);
      const body = {
        comment: "native guest",
        errorCode: "TECHNICAL_PROBLEM",
        guestContext: context.data.proof,
      };
      const submit = (payload: unknown, headers: Record<string, string> = {}) =>
        fetch(`${url}/v1/support/reports`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": crypto.randomUUID(),
            ...headers,
          },
          body: JSON.stringify(payload),
        });
      const accepted = await submit(body);
      expect(accepted.status).toBe(202);
      const receipt = await accepted.json();
      const guest = await support.db
        .collection(support.collections.reports)
        .findOne({ reportId: receipt.data.reportId });
      expect(guest?.owner.kind).toBe("guest");
      expect((await submit({ ...body, userId: "forged" })).status).toBe(400);
      expect((await submit({ ...body, guestContext: "wrong" })).status).toBe(
        403,
      );
      expect(
        (await submit(body, { authorization: `Bearer ${context.data.proof}` }))
          .status,
      ).toBe(503);
      const account = await users.account();
      const login = await fetch(`${url}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(account),
      });
      const credentials = await login.json();
      expect(credentials.ok).toBe(true);
      const authenticated = await submit(
        { ...body, comment: "native verified user" },
        { authorization: `Bearer ${credentials.data.accessToken}` },
      );
      expect(authenticated.status).toBe(202);
      const userReceipt = await authenticated.json();
      const report = await support.db
        .collection(support.collections.reports)
        .findOne({ reportId: userReceipt.data.reportId });
      expect(report?.owner.id).toBe(credentials.data.user.id);
      expect(report?.owner.kind).toBe("user");
      process.stdout.write(
        JSON.stringify({
          nativeSupport: "passed",
          guestProofNotAccess: "passed",
          sessionActor: "passed",
        }),
      );
    } finally {
      await app.close();
    }
  } finally {
    await users.dispose();
  }
} finally {
  await support.dispose();
}
