import { expect, test } from "bun:test";
import {
  allowAnalytics,
  readPreference,
  savePreference,
} from "../../apps/be-insta/src/domains/privacy/index";
import { evaluateFenced } from "../../apps/be-insta/src/lib/dragonfly/index";
import { createPrivacyEnvironment } from "../fixtures/privacy-environment";

test("real Dragonfly proof, concurrent CAS, immutable TTL, rate and unavailable outcomes", async () => {
  const fixture = await createPrivacyEnvironment();
  try {
    const first = await savePreference(
      { choice: "all", policyVersion: 1, source: fixture.source },
      fixture.dependencies,
    );
    if (first.isError()) throw new Error(first.getError());
    const { contextProof, preference } = first.get();
    expect(contextProof).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const key = `auth:${fixture.generation}:privacy:preference:${preference.contextId}`;
    const before = Number(await fixture.broker.send("PTTL", [key]));
    expect(
      (await readPreference({ contextProof }, fixture.dependencies)).choice,
    ).toBe("all");
    const stored = await fixture.broker.get(key);
    expect(stored).not.toContain(contextProof);
    expect(
      Number(await fixture.broker.send("PTTL", [key])),
    ).toBeLessThanOrEqual(before);
    expect(
      (
        await readPreference(
          { contextProof: "b".repeat(43) },
          fixture.dependencies,
        )
      ).choice,
    ).toBe("necessary");
    const updates = await Promise.all(
      ["necessary", "all"].map((choice) =>
        savePreference(
          {
            contextProof,
            choice: choice === "all" ? "all" : "necessary",
            policyVersion: 1,
            expectedRevision: 1,
            source: fixture.source,
          },
          fixture.dependencies,
        ),
      ),
    );
    expect(updates.filter((result) => result.isOk())).toHaveLength(1);
    expect(updates.filter((result) => result.isError())).toHaveLength(1);
    expect(
      await allowAnalytics({ reference: preference }, fixture.dependencies),
    ).toBe("denied");
    const denied = await Promise.all(
      Array.from({ length: 10 }, () =>
        savePreference(
          { choice: "all", policyVersion: 1, source: fixture.source },
          fixture.dependencies,
        ),
      ),
    );
    expect(
      denied.some(
        (result) => result.isError() && result.getError() === "rateLimited",
      ),
    ).toBe(true);
    expect(denied.filter((result) => result.isOk())).toHaveLength(7);
  } finally {
    await fixture.dispose();
  }
  const unavailable = await createPrivacyEnvironment();
  unavailable.broker.close();
  expect(
    (
      await readPreference(
        { contextProof: "a".repeat(43) },
        unavailable.dependencies,
      )
    ).choice,
  ).toBe("necessary");
  const failedSave = await savePreference(
    { choice: "all", policyVersion: 1, source: unavailable.source },
    unavailable.dependencies,
  );
  expect(failedSave.isError()).toBe(true);
  if (failedSave.isError()) expect(failedSave.getError()).toBe("unavailable");
});
test("restored stale generation record and expired preference fail closed, explicit new choice renews context", async () => {
  const fixture = await createPrivacyEnvironment();
  try {
    const first = await savePreference(
      { choice: "all", policyVersion: 1, source: fixture.source },
      fixture.dependencies,
    );
    if (first.isError()) throw new Error(first.getError());
    const { preference, contextProof } = first.get();
    await evaluateFenced({
      client: fixture.broker,
      generation: fixture.generation,
      script: "return redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3])",
      keys: [`privacy:preference:${preference.contextId}`],
      arguments: [
        JSON.stringify({ ...preference, generation: "restored-old-process" }),
        "60000",
      ],
    });
    expect(
      (await readPreference({ contextProof }, fixture.dependencies)).choice,
    ).toBe("necessary");
    expect(
      await allowAnalytics(
        { reference: { ...preference, generation: "restored-old-process" } },
        fixture.dependencies,
      ),
    ).toBe("denied");
    await evaluateFenced({
      client: fixture.broker,
      generation: fixture.generation,
      script: "return redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3])",
      keys: [`privacy:preference:${preference.contextId}`],
      arguments: [
        JSON.stringify({ ...preference, expiresAt: Date.now() - 1 }),
        "60000",
      ],
    });
    expect(
      (await readPreference({ contextProof }, fixture.dependencies))
        .needsChoice,
    ).toBe(true);
    const renewed = await savePreference(
      {
        contextProof,
        choice: "necessary",
        policyVersion: 1,
        source: fixture.source,
      },
      fixture.dependencies,
    );
    if (renewed.isError()) throw new Error(renewed.getError());
    expect(renewed.get().contextProof).not.toBe(contextProof);
    expect(renewed.get().preference.revision).toBe(1);
  } finally {
    await fixture.dispose();
  }
});
