import { z } from "zod";
import { createMongoRegistrationPersistence } from "../../../apps/be-insta/src/domains/users/adapters/mongo/registration-persistence";
import { createDragonflyChallenges } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/dragonfly/challenges";
import { createDragonflyEmailJobs } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/dragonfly/jobs";
import { createRegistrationCrypto } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/jose/crypto";
import { createSmtpSender } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/smtp/sender";
import { completeRegistration } from "../../../apps/be-insta/src/domains/users/auth/use-cases/complete-registration";
import { requestCode } from "../../../apps/be-insta/src/domains/users/auth/use-cases/request-code";
import { verifyCode } from "../../../apps/be-insta/src/domains/users/auth/use-cases/verify-code";
import {
  connectDragonfly,
  readGeneration,
} from "../../../apps/be-insta/src/lib/dragonfly/index";
import { readTestApiConfig } from "../environment";
import { createAuthEnvironment } from "../users/auth-environment";
import { createMailObserver } from "./mailpit";

export const createRegistrationEnvironment = async () => {
  const base = await createAuthEnvironment();
  const config = readTestApiConfig();
  const broker = await connectDragonfly({ config: config.dragonfly });
  const generation = await readGeneration(broker);
  const namespace = `auth02:${crypto.randomUUID()}`;
  const emails = new Set<string>();
  const cryptography = createRegistrationCrypto(config.authSigningKey);
  const dependencies = {
    auth: base.auth,
    crypto: cryptography,
    challenges: createDragonflyChallenges({ client: broker, namespace }),
    persistence: base.persistenceWithClock(base.clock),
    registration: createMongoRegistrationPersistence({
      ...base.database,
      clock: base.clock,
    }),
  };
  const observer = createMailObserver({ url: config.mailpitUrl, emails });
  const mail = observer.read;
  const issue = async () => {
    const email = base.email(crypto.randomUUID());
    emails.add(email);
    const requested = await requestCode(
      { email, operationId: base.operation() },
      dependencies,
    );
    if (requested.isError()) throw new Error(requested.getError());
    const challenge = await dependencies.challenges.read(
      requested.get().challengeId,
    );
    if (!challenge) throw new Error("Challenge absent");
    const payload = await broker.get(
      `auth:${generation}:${namespace}:payload:${challenge.version}`,
    );
    if (!payload) throw new Error("Payload absent");
    const value = await cryptography.openMail(payload);
    return { email, code: value.code, challenge, request: requested.get() };
  };
  const pending = async () => {
    const issued = await issue();
    const verified = await verifyCode(
      { challengeId: issued.challenge.challengeId, code: issued.code },
      dependencies,
    );
    if (verified.isError()) throw new Error(verified.getError());
    const value = verified.get();
    if (value.status !== "pending_setup") throw new Error("Expected setup");
    return { ...issued, ...value };
  };
  return {
    ...base,
    broker,
    generation,
    namespace,
    dependencies,
    issue,
    pending,
    mail,
    ownEmail: (email: string) => emails.add(email),
    jobs: createDragonflyEmailJobs({
      client: broker,
      namespace,
      consumer: crypto.randomUUID(),
      clock: base.clock,
    }),
    sender: createSmtpSender(config.smtp),
    complete: async () => {
      const value = await pending();
      const input = {
        proof: value.registrationProof,
        username: `U${crypto.randomUUID().replaceAll("-", "").slice(0, 25)}`,
        password: "synthetic-password-123",
        idempotencyKey: crypto.randomUUID(),
        operationId: base.operation(),
      };
      return {
        value,
        input,
        result: await completeRegistration(input, dependencies),
      };
    },
    dispose: async () => {
      try {
        await observer.dispose();
        const pattern = `auth:${generation}:${namespace}:*`;
        const keys = z
          .array(z.string())
          .parse(await broker.send("KEYS", [pattern]));
        for (const key of keys) await broker.del(key);
        if (
          z.array(z.string()).parse(await broker.send("KEYS", [pattern])).length
        )
          throw new Error("Registration key cleanup incomplete");
      } finally {
        broker.close();
        await base.dispose();
      }
    },
  };
};
