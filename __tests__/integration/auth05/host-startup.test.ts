import { expect, test } from "bun:test";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import { startAuthHost } from "../../fixtures/auth05/host/start";
import { createBffEnvironment } from "../../fixtures/bff-session/environment";
import { readTestApiConfig } from "../../fixtures/environment";
import { withOwnedProbe } from "./lib/probe";

test("host startup compensation deletes actual owned accounts after registration acquisition fails", async () => {
  await withOwnedProbe({
    acquire: () => connectDatabase({ config: readTestApiConfig().mongo }),
    run: async (probe) => {
      const fixture = await createBffEnvironment();
      const owned = { emailKey: { $regex: `^${fixture.native.runId}-` } };
      const failure = new Error(
        "Synthetic registration acquisition failure after accounts",
      );
      await expect(
        startAuthHost({
          createFixture: async () => fixture,
          createRegistration: async () => {
            expect(
              await probe.apiDb.collection("users").countDocuments(owned),
            ).toBe(2);
            throw failure;
          },
          createObserver: () => {
            throw new Error("Observer must not start");
          },
          serve: () => {
            throw new Error("HTTP must not start");
          },
        }),
      ).rejects.toBe(failure);
      expect(await probe.apiDb.collection("users").countDocuments(owned)).toBe(
        0,
      );
    },
  });
});
