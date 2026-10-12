import { startAuthFixture } from "../../fixtures/auth05/browser";
import { expect, test } from "../../fixtures/browser-egress/test";
import { loginMainUser } from "./lib/faults";

const sources: string[] = [];
for (const caseId of [1, 2])
  test(`owned egress case ${caseId} has a distinct actual signed native source budget`, async ({
    page,
    browserEgress,
  }) => {
    const fixture = await startAuthFixture();
    try {
      expect(sources).not.toContain(browserEgress.address);
      expect(await browserEgress.observe()).toBe(0);
      await loginMainUser(page, fixture.account);
      expect(await browserEgress.observe()).toBe(1);
      const response = await page.request.post(
        "https://localhost/api/auth/login",
        { headers: { origin: "https://localhost" }, data: fixture.account },
      );
      expect(response.status()).toBe(200);
      expect(await browserEgress.observe()).toBe(2);
      for (const previous of sources)
        expect(await browserEgress.observe(previous)).toBe(2);
      sources.push(browserEgress.address);
      console.log(
        JSON.stringify({
          caseId,
          actualSourceAddress: browserEgress.address,
          actualNativeSourceCount: 2,
          previousOwnedBudgetsUnchanged: true,
        }),
      );
    } finally {
      await fixture.dispose();
    }
  });
