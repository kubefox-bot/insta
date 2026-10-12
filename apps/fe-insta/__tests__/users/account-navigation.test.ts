import { afterAll, expect, test } from "bun:test";
import { createServer } from "vite";
import { SSR_CONFIGURATION } from "../../config/conts";
import type {
  AuthBrowser,
  AuthView,
} from "../../src/domains/users/browser/index";
import { messages } from "../../src/lib/i18n/index";

const server = await createServer({
  root: new URL("../../", import.meta.url).pathname,
  plugins: [
    {
      name: "root-auth-render-fixture",
      enforce: "pre",
      resolveId: (source, importer) => {
        if (
          source === "virtual:root-auth-users" ||
          (importer?.endsWith("/src/routes/+layout.svelte") &&
            source === "../domains/users/browser/index")
        )
          return "\0root-auth-users";
      },
      load: (id) => {
        if (id === "\0root-auth-users") {
          const publicEntry = JSON.stringify(
            new URL("../../src/domains/users/browser/index.ts", import.meta.url)
              .pathname,
          );
          return (
            "export * from " +
            publicEntry +
            "; import {createAuthBrowser as createRealAuth} from " +
            publicEntry +
            "; let selected; export const selectAuth = (auth) => {selected = auth;}; export const createAuthBrowser = (options) => selected ?? createRealAuth(options);"
          );
        }
      },
    },
  ],
  cacheDir: new URL(
    "../../node_modules/.vite-account-navigation",
    import.meta.url,
  ).pathname,
  ssr: {
    ...SSR_CONFIGURATION,
    noExternal: [...SSR_CONFIGURATION.noExternal, "svelte", /^svelte\//],
    optimizeDeps: {
      exclude: ["svelte", "svelte/server", "svelte/internal/server"],
    },
  },
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
afterAll(() => server.close());
const { render } = await server.ssrLoadModule("svelte/server");
const { default: RegistrationForm } = await server.ssrLoadModule(
  "/src/domains/users/components/RegistrationForm/index.svelte",
);
const root = await server.ssrLoadModule("/src/routes/+page.server.ts");

test("registration email stage offers the code request while retaining native validation and intent URL", () => {
  const html = render(RegistrationForm, {
    props: {
      copy: messages.ru,
      locale: "ru",
      stage: "start",
      action: "/?mode=register&intentId=selected",
    },
  }).body;
  expect(html).toContain("Твоя почта");
  expect(html).toContain("Получить код");
  expect(html).toMatch(/<input[^>]*type="email"[^>]*required/);
  expect(html).toContain('action="/?mode=register&amp;intentId=selected"');
});

test("registration verify and setup preserve OTP, resend and password constraints under clearer labels", () => {
  const verify = render(RegistrationForm, {
    props: { copy: messages.ru, locale: "ru", stage: "verify" },
  }).body;
  expect(verify).toContain("Код из письма");
  expect(verify).toContain("Продолжить");
  expect(verify).toContain('autocomplete="one-time-code"');
  expect(verify).toContain('maxlength="6"');
  expect(verify).toContain('value="resend"');
  const setup = render(RegistrationForm, {
    props: { copy: messages.ru, locale: "ru", stage: "setup" },
  }).body;
  expect(setup).toContain("Как тебя будут находить");
  expect(setup).toContain("Создать аккаунт");
  expect(setup).toContain('autocomplete="new-password"');
  expect(setup).toContain('name="username"');
});

test("ordinary member root lands on the chat list without choosing a conversation", async () => {
  const outcome = await Promise.resolve()
    .then(() =>
      root.load({
        parent: async () => ({
          session: { actor: { userId: "alice" } },
          selectedIntent: null,
        }),
        url: new URL("https://insta.test/"),
      }),
    )
    .catch((redirect) => redirect);
  expect(outcome).toMatchObject({ status: 303, location: "/conversations" });
});

test("root preserves explicit login, registration and protected continuation selections", async () => {
  for (const search of [
    "?mode=login",
    "?mode=register",
    "?intentId=selected",
  ]) {
    expect(
      await root.load({
        parent: async () => ({
          session: { actor: { userId: "alice" } },
          selectedIntent: search.includes("intentId") ? "selected" : null,
        }),
        url: new URL(`https://insta.test/${search}`),
      }),
    ).toEqual({});
  }
  expect(
    await root.load({
      parent: async () => ({ session: { actor: null }, selectedIntent: null }),
      url: new URL("https://insta.test/"),
    }),
  ).toEqual({});
});

const users = await server.ssrLoadModule("/src/domains/users/browser/index.ts");
test("member account control is an accessible avatar menu with complete username and no permanent logout", () => {
  expect(users.AccountMenu).toBeDefined();
  const html = render(users.AccountMenu, {
    props: {
      username: "LongUsername",
      identity: "alice",
      copy: messages.en,
      onLanguage: () => {},
      onPrivacy: () => {},
      onSupport: () => {},
      onLogout: () => {},
    },
  }).body;
  expect(html).toContain('aria-label="Account menu: LongUsername"');
  expect(html).toContain('data-testid="current-actor"');
  expect(html).toContain("LO");
  expect(html).not.toContain(">Sign out<");
  expect(html).not.toContain(">English<");
});

const rootAuthFixture = await server.ssrLoadModule("virtual:root-auth-users");
const { default: RootLayout } = await server.ssrLoadModule(
  "/src/routes/+layout.svelte",
);
const { createRawSnippet } = await server.ssrLoadModule("svelte");
const shellStyles = (
  await server.ssrLoadModule(
    "/src/app/shell/browser/components/Shell/styles.module.css",
  )
).default;
const initialActor = { userId: "alice", username: "Alice", generation: "S1" };
const nextActor = { userId: "bob", username: "Bob", generation: "S2" };

/** Рендерит настоящий корневой layout с сохранённым SSR snapshot и отдельным настоящим public auth owner; браузерный lifecycle здесь не запускается. */
const renderRootAuth = ({
  snapshot,
  auth,
  stories = false,
}: Readonly<{ snapshot: AuthView; auth?: AuthBrowser; stories?: boolean }>) => {
  rootAuthFixture.selectAuth(auth);
  return render(RootLayout, {
    context: new Map([
      [
        "__request__",
        {
          page: {
            url: new URL(
              "https://insta.test/conversations/012345678901234567890123",
            ),
            route: { id: "/conversations/[id]" },
            params: { id: "012345678901234567890123" },
            data: { registration: null, selectedIntent: null },
            form: null,
          },
        },
      ],
    ]),
    props: {
      data: {
        session: snapshot,
        locale: "en",
        privacy: { choice: "necessary", policyVersion: 1, revision: 1 },
        conversations: [],
        conversationsActor: null,
        conversationsIssue: null,
        storiesFeed: stories
          ? { kind: "ready", page: { authors: [], cursor: null } }
          : null,
        storiesPolicy: null,
      },
      children: createRawSnippet(() => ({
        render: () => "<p>Route content</p>",
      })),
    },
  }).body;
};

/** Создаёт реальный auth store через публичную точку входа; source fixture не приобретает browser I/O или приватные ресурсы. */
const sourceAuth = (initial: AuthView) =>
  users.createAuthBrowser({
    initial,
    read: async () => null,
    clearPrivate: () => {},
    synchronization: {
      exclusive: async (operation: () => Promise<unknown>) => operation(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });

test("root Shell removes both conversation flags after public logout despite retained member SSR data", () => {
  const snapshot = { actor: initialActor, status: "authenticated" } as const;
  const auth = sourceAuth(snapshot);
  const initial = renderRootAuth({ snapshot, auth });
  expect(initial).toContain(shellStyles.workspace);
  expect(initial).toContain(shellStyles.detail);
  expect(initial).toContain('aria-label="Account menu: Alice"');
  expect(initial).toContain("<noscript>");
  auth.accept(null);
  const guest = renderRootAuth({ snapshot, auth });
  expect(guest).not.toContain(shellStyles.workspace);
  expect(guest).not.toContain(shellStyles.detail);
  expect(guest).toContain('href="/?mode=login"');
  expect(guest).not.toContain('data-testid="current-actor"');
  expect(guest).not.toContain('aria-label="Stories"');
  expect(snapshot.actor).toEqual(initialActor);
});

test("root Shell follows guest login and session loss without replacing the guest SSR snapshot", () => {
  const snapshot = { actor: null, status: "guest" } as const;
  const auth = sourceAuth(snapshot);
  const initial = renderRootAuth({ snapshot, auth, stories: true });
  expect(initial).not.toContain(shellStyles.workspace);
  expect(initial).not.toContain(shellStyles.detail);
  expect(initial.match(/aria-label="Stories"/g)).toHaveLength(1);
  auth.accept(nextActor);
  const member = renderRootAuth({ snapshot, auth, stories: true });
  expect(member).toContain(shellStyles.workspace);
  expect(member).toContain(shellStyles.detail);
  expect(member).toContain('aria-label="Account menu: Bob"');
  expect(member).not.toContain('aria-label="Stories"');
  auth.accept(null);
  const expired = renderRootAuth({ snapshot, auth, stories: true });
  expect(expired).not.toContain(shellStyles.workspace);
  expect(expired).not.toContain(shellStyles.detail);
  expect(expired.match(/aria-label="Stories"/g)).toHaveLength(1);
  expect(expired).toContain('href="/?mode=login"');
  expect(snapshot.actor).toBeNull();
});

test("root initializes request-owned auth from member and guest SSR data without JavaScript", () => {
  const member = renderRootAuth({
    snapshot: { actor: initialActor, status: "authenticated" },
  });
  expect(member).toContain('aria-label="Account menu: Alice"');
  expect(member).toContain(shellStyles.workspace);
  expect(member).toContain(shellStyles.detail);
  expect(member).toContain('name="generation" value="S1"');
  const guest = renderRootAuth({ snapshot: { actor: null, status: "guest" } });
  expect(guest).toContain('href="/?mode=login"');
  expect(guest).not.toContain('data-testid="current-actor"');
  expect(guest).not.toContain(shellStyles.workspace);
  expect(guest).not.toContain(shellStyles.detail);
});
