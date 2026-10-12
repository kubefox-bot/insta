import { expect, test } from "bun:test";
import { withFrontendDev } from "./fixtures/frontend-dev/host";

test("native Vite loads Pino for both live and ordinary dependency-aware requests", async () => {
  await withFrontendDev(async (url) => {
    const live = await fetch(`${url}/api/health/live`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "ok" });
    const ready = await fetch(`${url}/api/health/ready`, {
      signal: AbortSignal.timeout(15000),
    });
    expect(ready.status).toBe(503);
    expect(JSON.stringify(await ready.json())).toContain(
      "DEPENDENCY_UNAVAILABLE",
    );
  });
}, 30000);

test("host dev applies configured HTTPS origin while rejecting different and spoofed origins", async () => {
  await withFrontendDev(
    async (url) => {
      const send = (origin: string) =>
        fetch(`${url}/api/privacy/consent`, {
          method: "POST",
          headers: {
            origin,
            "content-type": "application/json",
            "x-forwarded-proto": "http",
            "x-forwarded-host": "untrusted.invalid",
          },
          body: "{}",
        });
      expect((await send("https://localhost:24443")).status).toBe(400);
      expect((await send("http://localhost:24443")).status).toBe(403);
      expect((await send("https://untrusted.invalid")).status).toBe(403);
    },
    Object.fromEntries([["INSTA_HOST_DEV_ORIGIN", "https://localhost:24443"]]),
  );
}, 30000);
