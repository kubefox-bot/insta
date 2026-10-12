import { z } from "zod";
import { readInfraConfig } from "../../../scripts/infra/config";
import { cleanupResources } from "../../../scripts/testing/cleanup";
import type { OwnedResource } from "../../../scripts/testing/types";
import { waitUntil } from "../../fixtures/barrier";
import { expect, test } from "../../fixtures/browser-egress/test";
import { docker } from "../../fixtures/docker";
import { mailFields } from "../../fixtures/registration/mailpit";

test("native signup and real Mailpit browser observer (backend E02 slice)", async ({
  page,
  request,
}) => {
  const runId = `insta-auth02-${crypto.randomUUID()}`;
  const resources: OwnedResource[] = [];
  const id = await docker(
    "compose",
    "--project-name",
    readInfraConfig().project,
    "run",
    "-d",
    "--no-deps",
    "--name",
    runId,
    "--label",
    `insta.testRunId=${runId}`,
    "-p",
    "127.0.0.1::3001",
    "testhost",
    "bun",
    "--cwd",
    "apps/be-insta",
    "__tests__/registration/host.ts",
  );
  resources.push({ kind: "container", id });
  try {
    const port = (await docker("port", id, "3001/tcp")).split(":").at(-1);
    const api = `http://127.0.0.1:${port}`;
    await waitUntil({
      check: async () =>
        fetch(`${api}/health/live`).then(
          async (res) => {
            await res.body?.cancel();
            return res.ok;
          },
          () => false,
        ),
    });
    const fixture = z
      .object({ email: z.email() })
      .parse(await (await request.get(`${api}/__tests__/fixture`)).json());
    const started = await request.post(`${api}/v1/auth/registration/start`, {
      data: { email: fixture.email, operationId: crypto.randomUUID() },
    });
    expect(started.status()).toBe(200);
    const challenge = z
      .object({ data: z.object({ challengeId: z.string() }) })
      .parse(await started.json()).data;
    const mailURL = "http://127.0.0.1:18025";
    const findMail = async () =>
      z
        .object({
          messages: z.array(z.object({ [mailFields.id]: z.string() })),
        })
        .parse(
          await (
            await request.get(`${mailURL}/api/v1/search`, {
              params: { query: `to:${fixture.email}` },
            })
          ).json(),
        ).messages;
    await expect.poll(async () => (await findMail()).length).toBe(1);
    const messageId = (await findMail())[0]?.ID;
    if (!messageId) throw new Error("Expected owned mail");
    const mail = z
      .object({ [mailFields.text]: z.string() })
      .parse(
        await (
          await request.get(`${mailURL}/api/v1/message/${messageId}`)
        ).json(),
      );
    const code = z
      .string()
      .parse(mail.Text.match(/Код подтверждения: ([0-9]{6})/)?.[1]);
    await page.goto(mailURL);
    const search = page.getByRole("textbox", { name: "Search", exact: true });
    await search.fill(`to:${fixture.email}`);
    await search.press("Enter");
    await expect(page.locator("body")).toContainText("Код подтверждения Insta");
    await expect(page.locator("body")).toContainText(code);
    const verified = await request.post(`${api}/v1/auth/registration/verify`, {
      data: { ...challenge, code },
    });
    expect(verified.status()).toBe(200);
    const proof = z
      .object({ data: z.object({ registrationProof: z.string() }) })
      .parse(await verified.json()).data.registrationProof;
    const input = {
      proof,
      username: `U${crypto.randomUUID().replaceAll("-", "").slice(0, 25)}`,
      password: "synthetic-password-123",
      operationId: crypto.randomUUID(),
    };
    const key = crypto.randomUUID();
    const completed = await request.post(
      `${api}/v1/auth/registration/complete`,
      { headers: { "X-Idempotency-Key": key }, data: input },
    );
    expect(completed.status()).toBe(200);
    const body = z
      .object({
        data: z.object({
          accessToken: z.string(),
          backendSessionId: z.string(),
        }),
        meta: z.object({ operationId: z.string() }),
      })
      .parse(await completed.json());
    const repeated = await request.post(
      `${api}/v1/auth/registration/complete`,
      {
        headers: { "X-Idempotency-Key": key },
        data: { ...input, operationId: crypto.randomUUID() },
      },
    );
    expect(repeated.status()).toBe(200);
    expect((await repeated.json()).data.backendSessionId).toBe(
      body.data.backendSessionId,
    );
    expect(
      (
        await request.get(`${api}/v1/me`, {
          headers: { authorization: `Bearer ${body.data.accessToken}` },
        })
      ).status(),
    ).toBe(200);
  } finally {
    test.setTimeout(test.info().timeout + 20000);
    await docker("stop", "--time", "15", id);
    const exitCode = await docker(
      "inspect",
      "--format",
      "{{.State.ExitCode}}",
      id,
    );
    await cleanupResources({ testRunId: runId, resources, execute: docker });
    expect(exitCode).toBe("0");
  }
});
