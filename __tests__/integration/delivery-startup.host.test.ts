import { expect, test } from "bun:test";
import { waitUntil } from "../fixtures/barrier";
import { withOrdinaryDeliveryStartup } from "../fixtures/delivery/startup";
import { docker } from "../fixtures/docker";

test("ordinary backend launcher admits auth/Mongo while delivery init retries and recovers without backend restart", async () => {
  await withOrdinaryDeliveryStartup(async (fixture) => {
    await fixture.launch();
    const api = await fixture.backend();
    const control = await fixture.control();
    const id = await fixture.serviceId("be-insta");
    const started = await docker(
      "inspect",
      "--format",
      "{{.State.StartedAt}}",
      id,
    );
    await waitUntil({
      check: async () =>
        Number(
          await docker(
            "inspect",
            "--format",
            "{{.RestartCount}}",
            await fixture.serviceId("delivery-broker-init"),
          ),
        ) > 0,
    });
    expect(
      (await (await fetch(api + "/health/ready")).json()).data,
    ).toMatchObject({ status: "ok", delivery: "degraded" });
    const { accounts, ids } = await (await fetch(control + "/accounts")).json();
    const login = await fetch(api + "/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-operation-id": crypto.randomUUID(),
      },
      body: JSON.stringify(accounts[0]),
    });
    expect(login.status).toBe(200);
    const signed = await login.json();
    const token = signed.data.accessToken;
    const post = (path: string, body: unknown) =>
      fetch(api + path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-operation-id": crypto.randomUUID(),
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    const pair = await post("/v1/conversations", { recipientId: ids[1] });
    expect(pair.status).toBe(200);
    const conversation = (await pair.json()).data.conversation.id;
    const sent = await post(`/v1/conversations/${conversation}/messages`, {
      text: "ordinary unavailable startup",
      clientMessageId: crypto.randomUUID(),
    });
    expect(sent.status).toBe(200);
    await sent.body?.cancel();
    expect((await (await fetch(control + "/count")).json()).messages).toBe(1);
    await fixture.restoreProvider();
    await waitUntil({
      check: async () => {
        const init = await docker(
          "inspect",
          "--format",
          "{{.State.Status}} {{.State.ExitCode}}",
          await fixture.serviceId("delivery-broker-init"),
        );
        return (
          init === "exited 0" &&
          (await (await fetch(api + "/health/ready")).json()).data.delivery ===
            "ok"
        );
      },
    });
    expect(
      await docker("inspect", "--format", "{{.State.StartedAt}}", id),
    ).toBe(started);
    expect((await (await fetch(control + "/delivery-ping")).json()).pong).toBe(
      "PONG",
    );
    const completedInit = await fixture.serviceId("delivery-broker-init");
    await docker("restart", await fixture.serviceId("dragonfly-delivery"));
    await fixture.restoreProvider();
    await waitUntil({
      check: async () =>
        (await docker(
          "inspect",
          "--format",
          "{{.State.Health.Status}}",
          await fixture.serviceId("dragonfly-delivery"),
        )) === "healthy",
    });
    expect(await fixture.serviceId("delivery-broker-init")).toBe(completedInit);
    expect(
      await docker(
        "inspect",
        "--format",
        "{{.State.Status}} {{.State.ExitCode}}",
        completedInit,
      ),
    ).toBe("exited 0");
    expect(
      (await (await fetch(api + "/health/ready")).json()).data,
    ).toMatchObject({ status: "ok", delivery: "degraded" });
    await fixture.launch();
    await waitUntil({
      check: async () =>
        (await (await fetch(api + "/health/ready")).json()).data.delivery ===
        "ok",
    });
    expect(await fixture.serviceId("delivery-broker-init")).not.toBe(
      completedInit,
    );
    expect(
      await docker("inspect", "--format", "{{.State.StartedAt}}", id),
    ).toBe(started);
  });
}, 120000);
