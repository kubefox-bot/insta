import { z } from "zod";
import { readHostSettings } from "../../../scripts/infra/host/config";
import { startAuthFixture } from "../../fixtures/auth05/browser";
import { readAuthFixtureConfig } from "../../fixtures/auth05/config";
import { logoutUser, loginUser as signIn } from "../../fixtures/auth05/ui";
import { expect, test } from "../../fixtures/browser-egress/test";
import {
  mailMessageSchema,
  mailSearchSchema,
} from "../../fixtures/registration/mailpit";

const readCode = async (email: string) => {
  const find = async () =>
    mailSearchSchema.parse(
      await (
        await fetch(
          `${readAuthFixtureConfig().hostMailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        )
      ).json(),
    ).messages;
  await expect.poll(async () => (await find()).length).toBe(1);
  const id = (await find())[0]?.ID;
  if (!id) throw new Error("Expected owned Mailpit message");
  const mail = mailMessageSchema.parse(
    await (
      await fetch(
        `${readAuthFixtureConfig().hostMailpitUrl}/api/v1/message/${id}`,
      )
    ).json(),
  );
  return z
    .string()
    .regex(/^[0-9]{6}$/)
    .parse(mail.Text.match(/Код подтверждения: ([0-9]{6})/)?.[1]);
};
test("real registration form preserves HttpOnly setup proof through reload and logs in, then logs out", async ({
  page,
  context,
}) => {
  const fixture = await startAuthFixture();
  const nonUtc = await context.newCDPSession(page);
  await nonUtc.send("Emulation.setTimezoneOverride", {
    timezoneId: "Asia/Tbilisi",
  });
  try {
    await page.goto("https://localhost/?mode=register");
    await expect(
      page.getByRole("dialog", { name: "Create account", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Your email", exact: true })
      .fill(fixture.signupEmail);
    await page.getByRole("button", { name: "Get code", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Code from your email", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("UTC");
    const cookie = (await context.cookies()).find(
      (cookie) => cookie.name === "insta_registration",
    );
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    const code = await readCode(fixture.signupEmail);
    await page
      .getByRole("textbox", { name: "Code from your email", exact: true })
      .fill(code === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page
      .getByRole("textbox", { name: "Code from your email", exact: true })
      .fill(code);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("textbox", {
        name: "How people will find you",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("textbox", {
        name: "How people will find you",
        exact: true,
      }),
    ).toBeVisible();
    expect(await page.content()).not.toContain("registrationProof");
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "insta_registration",
    );
    const username = `A${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await page
      .getByRole("textbox", { name: "How people will find you", exact: true })
      .fill(username);
    await page
      .getByLabel("Password", { exact: true })
      .fill("synthetic-password-123");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByTestId("current-actor")).toHaveText(username);
    expect(
      (await context.cookies()).find(
        (cookie) => cookie.name === "insta_session",
      ),
    ).toMatchObject({ httpOnly: true, secure: true });
    await page.getByRole("button", { name: /^Account menu:/ }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page.getByTestId("current-actor")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }).first(),
    ).toBeVisible();
  } finally {
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
test("two actual tabs serialize concurrent product auth actions and synchronize current actor", async ({
  page,
  context,
}) => {
  const fixture = await startAuthFixture();
  const second = await context.newPage();
  try {
    await signIn(page, fixture.account);
    await second.goto("https://localhost/?mode=login");
    const oldActor = await page.getByTestId("current-actor").textContent();
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await page.route("https://localhost/", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      reached.resolve();
      await release.promise;
      await route.fulfill({ response });
    });
    await logoutUser(page);
    await reached.promise;
    await expect(page.getByTestId("current-actor")).toHaveCount(0);
    await second.reload();
    await expect(
      second.getByRole("dialog", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await second
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(fixture.secondAccount.email);
    await second
      .getByLabel("Password", { exact: true })
      .fill(fixture.secondAccount.password);
    let secondPosts = 0;
    const secondReached = Promise.withResolvers<void>();
    second.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url() === "https://localhost/?mode=login"
      ) {
        secondPosts += 1;
        secondReached.resolve();
      }
    });
    await second.getByRole("button", { name: "Sign in", exact: true }).click();
    const lockState = await second.evaluate(async () =>
      navigator.locks.query(),
    );
    expect(
      lockState.held?.some((lock) => lock.name === "insta/auth/mutation"),
    ).toBe(true);
    expect(
      lockState.pending?.some((lock) => lock.name === "insta/auth/mutation"),
    ).toBe(true);
    expect(secondPosts).toBe(0);
    release.resolve();
    await secondReached.promise;
    await expect(second.getByTestId("current-actor")).toBeVisible();
    await expect(page.getByTestId("current-actor")).toHaveText(
      await second.getByTestId("current-actor").innerText(),
    );
    expect(await second.getByTestId("current-actor").innerText()).not.toBe(
      oldActor,
    );
  } finally {
    await second.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
test("late S1 transport logout cannot replace S2 identity shown in either tab", async ({
  page,
  context,
}) => {
  const fixture = await startAuthFixture();
  const second = await context.newPage();
  try {
    await signIn(page, fixture.account);
    await second.goto("https://localhost/?mode=login");
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await page.route("**/api/session/logout", async (route) => {
      const response = await route.fetch();
      expect(response.headers()["set-cookie"]).toBeUndefined();
      reached.resolve();
      await release.promise;
      await route.fulfill({ response });
    });
    const late = page.evaluate(async () => {
      const response = await fetch("/api/session/logout", { method: "POST" });
      return response.status;
    });
    await reached.promise;
    await signIn(second, fixture.secondAccount);
    const currentCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "insta_session",
    )?.value;
    await expect(page.getByTestId("current-actor")).toHaveText(
      await second.getByTestId("current-actor").innerText(),
    );
    release.resolve();
    expect(await late).toBe(200);
    expect(
      (await context.cookies()).find(
        (cookie) => cookie.name === "insta_session",
      )?.value,
    ).toBe(currentCookie);
    await page.reload();
    await expect(page.getByTestId("current-actor")).toHaveText(
      await second.getByTestId("current-actor").innerText(),
    );
  } finally {
    await second.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
test("lost login response reconciles established cookie before another UI mutation", async ({
  page,
}) => {
  const fixture = await startAuthFixture();
  try {
    await page.goto("https://localhost/?mode=login");
    await expect(
      page.getByRole("dialog", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page.route("https://localhost/?mode=login", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, body: "lost action body" });
    });
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(fixture.account.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(fixture.account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByTestId("current-actor")).toBeVisible();
  } finally {
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
test("native JS-disabled registration and sign-in remain usable with SSR", async ({
  browser,
  proxy,
}) => {
  const fixture = await startAuthFixture();
  const context = await browser.newContext({
    proxy,
    javaScriptEnabled: false,
    ignoreHTTPSErrors: true,
    locale: "en-US",
  });
  const page = await context.newPage();
  try {
    await page.goto(
      `http://localhost:${readHostSettings().httpPort}/?mode=register`,
    );
    await page
      .getByRole("textbox", { name: "Your email", exact: true })
      .fill(fixture.noJsEmail);
    await page.getByRole("button", { name: "Get code", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Code from your email", exact: true })
      .fill(await readCode(fixture.noJsEmail));
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const username = `N${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await page
      .getByRole("textbox", { name: "How people will find you", exact: true })
      .fill(username);
    await page
      .getByLabel("Password", { exact: true })
      .fill("synthetic-password-123");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByTestId("current-actor")).toHaveText(username);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signIn(
      page,
      {
        email: fixture.noJsEmail,
        password: "synthetic-password-123",
      },
      "native",
    );
    await expect(page.getByTestId("current-actor")).toHaveText(username);
  } finally {
    await context.close();
    test.setTimeout(test.info().timeout + 20000);
    await fixture.dispose();
  }
});
