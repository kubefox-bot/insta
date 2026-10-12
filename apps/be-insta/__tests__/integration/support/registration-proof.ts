import { expect } from "bun:test";
import { createRegistrationEnvironment } from "../../../../../__tests__/fixtures/registration/environment";
import { createSupportEnvironment } from "../../../../../__tests__/fixtures/support/environment";
import { createApplication } from "../../../src/app/bootstrap";

const support = await createSupportEnvironment();
try {
  const registration = await createRegistrationEnvironment();
  try {
    const pending = await registration.pending();
    const original = await registration.db
      .collection("users")
      .findOne({ emailKey: pending.email });
    if (!original) throw new Error("Expected owned pending account");
    const app = await createApplication(
      {
        support: support.dependencies,
        users: {
          ...registration.users,
          registration: registration.dependencies,
        },
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
      const username = `U${crypto.randomUUID().replaceAll("-", "").slice(0, 25)}`;
      const response = await fetch(`${url}/v1/auth/registration/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          proof: context.data.proof,
          username,
          password: "synthetic-support-rejection-123",
          operationId: registration.operation(),
        }),
      });
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe(
        "REGISTRATION_PROOF_INVALID",
      );
      const after = await registration.db
        .collection("users")
        .findOne({ _id: original._id });
      expect(after?.status).toBe("pending_setup");
      expect(after?.passwordHash).toBe(original.passwordHash);
      expect(
        await registration.db
          .collection("users_sessions")
          .countDocuments({ userId: original._id }),
      ).toBe(0);
      expect(
        await registration.db
          .collection("users")
          .countDocuments({ usernameKey: username.toLowerCase() }),
      ).toBe(0);
      expect(
        await registration.db.collection("users_outbox").countDocuments({
          userId: original._id,
          type: "registration_completed",
        }),
      ).toBe(0);
      process.stdout.write(
        JSON.stringify({
          registrationProofRejected: true,
          pendingAccountPreserved: true,
          sessions: 0,
          canonicalActivation: 0,
        }),
      );
    } finally {
      await app.close();
    }
  } finally {
    await registration.dispose();
  }
} finally {
  await support.dispose();
}
