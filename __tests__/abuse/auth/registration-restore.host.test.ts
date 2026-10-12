import { expect, test } from "bun:test";
import { createDragonflyChallenges } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/dragonfly/challenges";
import { createDragonflyEmailJobs } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/dragonfly/jobs";
import { createRegistrationCrypto } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/jose/crypto";
import { bootstrapGeneration } from "../../../apps/be-insta/src/lib/dragonfly/bootstrap";
import {
  deleteRetiredKeys,
  readGeneration,
} from "../../../apps/be-insta/src/lib/dragonfly/index";
import { cleanupResources } from "../../../scripts/testing/cleanup";
import type { OwnedResource } from "../../../scripts/testing/types";
import { docker } from "../../fixtures/docker";
import { startBroker } from "../../fixtures/isolated-broker";

test("real OTP+pending Stream snapshot cannot resurrect consumed code or send restored mail after restart", async () => {
  const name = `insta-auth02-${crypto.randomUUID()}`;
  const resources: OwnedResource[] = [];
  await docker("volume", "create", "--label", `insta.testRunId=${name}`, name);
  resources.push({ kind: "volume", id: name });
  try {
    const { client } = await startBroker(name, resources);
    try {
      await bootstrapGeneration(client);
      const generation = await readGeneration(client);
      const cryptography = createRegistrationCrypto("aa".repeat(32));
      const email = `${name}@example.test`;
      const code = "123456";
      const version = cryptography.secret();
      const challengeId = cryptography.challengeId(email);
      const now = Date.now();
      const challenges = createDragonflyChallenges({ client });
      const challenge = {
        challengeId,
        version,
        registrationExpiresAt: now + 86400000,
        nextSendAt: now + 60000,
        revision: 1,
        errors: 0,
        consumed: false,
        codeDigest: cryptography.codeDigest({ challengeId, version, code }),
        ciphertext: await cryptography.sealMail({ email, code: "" }),
      };
      expect(
        (
          await challenges.enqueue({
            expected: null,
            challenge,
            operationId: crypto.randomUUID(),
            mailPayload: await cryptography.sealMail({ email, code }),
            now,
          })
        ).isOk(),
      ).toBe(true);
      const jobs = createDragonflyEmailJobs({
        client,
        consumer: "before-restart",
        clock: Date.now,
      });
      expect(await jobs.next()).not.toBeNull();
      await client.set(
        `auth:${generation}:users:privacy:sentinel`,
        "preserved",
      );
      expect(await client.send("SAVE", [])).toBe("OK");
      expect(
        (
          await challenges.verify({ expected: challenge, matches: true, now })
        ).isOk(),
      ).toBe(true);
      await docker("kill", "--signal", "KILL", name);
      client.close();
      await docker("rm", name);
      resources.pop();
      const { client: restored } = await startBroker(name, resources);
      try {
        const restoredChallenge = await restored.get(
          `auth:${generation}:users:registration:challenge:${challengeId}`,
        );
        expect(JSON.parse(restoredChallenge ?? "{}").consumed).toBe(false);
        await expect(
          createDragonflyChallenges({ client: restored }).read(challengeId),
        ).rejects.toThrow("BROKER_NOT_BOOTSTRAPPED");
        await bootstrapGeneration(restored);
        expect(await readGeneration(restored)).not.toBe(generation);
        const current = await readGeneration(restored);
        await expect(
          deleteRetiredKeys({
            client: restored,
            generation: current,
            retiredGeneration: current,
            namespace: "users:registration",
            keys: ["users:registration:mail"],
          }),
        ).rejects.toThrow("retired");
        await expect(
          deleteRetiredKeys({
            client: restored,
            generation: current,
            retiredGeneration: generation,
            namespace: "users:registration",
            keys: ["users:privacy:sentinel"],
          }),
        ).rejects.toThrow("outside owned");
        await expect(
          deleteRetiredKeys({
            client: restored,
            generation,
            retiredGeneration: current,
            namespace: "users:registration",
            keys: ["users:registration:mail"],
          }),
        ).rejects.toThrow("BROKER_GENERATION_STALE");
        expect(
          await createDragonflyChallenges({ client: restored }).read(
            challengeId,
          ),
        ).toBeNull();
        expect(
          await createDragonflyEmailJobs({
            client: restored,
            consumer: "after-restart",
            clock: Date.now,
          }).next(),
        ).toBeNull();
        expect(
          await restored.get(
            `auth:${generation}:users:registration:payload:${version}`,
          ),
        ).toBeNull();
        expect(
          await restored.get(`auth:${generation}:users:privacy:sentinel`),
        ).toBe("preserved");
        expect(
          Number(
            await restored.send("EXISTS", [
              `auth:${generation}:users:registration:mail`,
            ]),
          ),
        ).toBe(0);
      } finally {
        restored.close();
      }
    } finally {
      client.close();
    }
  } finally {
    await cleanupResources({ testRunId: name, resources, execute: docker });
  }
}, 60000);
