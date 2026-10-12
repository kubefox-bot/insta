import { expect, test } from "bun:test";
import { runCapacity } from "../fixtures/delivery/capacity/run";

for (const profile of ["fanout", "conversation"] as const)
  for (const rate of [1, 3])
    test(`dedicated1gb capacity ${profile} ${rate} aggregate entries per second for 24h`, async () => {
      const result = await runCapacity({ profile, rate });
      console.log(
        JSON.stringify({
          capacity: {
            ...result,
            averageEncodedBytes:
              result.encodedBytes / Math.max(result.inserted, 1),
            memoryLimit: "1gb",
            containerLimitMb: 1536,
            authBroker: "independent256mb",
          },
        }),
      );
      expect(result.oom).toBe(false);
      expect(result.inserted).toBe(result.total);
      expect(result.restoreOutcome).toBe("complete");
      for (const sample of result.samples)
        expect(sample).toMatchObject({ auth: "pass" });
    }, 900000);
