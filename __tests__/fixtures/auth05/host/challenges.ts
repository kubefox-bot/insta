import { z } from "zod";
import type { createRegistrationCrypto } from "../../../../apps/be-insta/src/domains/users/auth/adapters/registration/jose/crypto";
import type { connectDragonfly } from "../../../../apps/be-insta/src/lib/dragonfly/index";

export const cleanupChallenges = async ({
  broker,
  generation,
  cryptography,
  emails,
}: Readonly<{
  broker: Awaited<ReturnType<typeof connectDragonfly>>;
  generation: string;
  cryptography: ReturnType<typeof createRegistrationCrypto>;
  emails: ReadonlySet<string>;
}>) => {
  const stream = `auth:${generation}:users:registration:mail`;
  for (const email of emails) {
    const challengeId = cryptography.challengeId(email);
    const key = `auth:${generation}:users:registration:challenge:${challengeId}`;
    const raw = await broker.get(key);
    if (raw) {
      const challenge = z
        .object({ version: z.string() })
        .parse(JSON.parse(raw));
      await broker.del(
        `auth:${generation}:users:registration:payload:${challenge.version}`,
      );
    }
    await broker.del(key);
    const entries = z
      .array(z.tuple([z.string(), z.array(z.string())]))
      .parse(await broker.send("XRANGE", [stream, "-", "+"]));
    for (const [id, fields] of entries)
      if (fields.includes(challengeId)) {
        await broker.send("XACK", [stream, "registration-mail-v1", id]);
        await broker.send("XDEL", [stream, id]);
      }
    if (await broker.get(key))
      throw new Error("Owned challenge cleanup incomplete");
  }
};
