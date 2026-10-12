import { expect, test } from "bun:test";
import { createBunHasher } from "../../../apps/be-insta/src/domains/users/adapters/passwords/bun-hasher";

test("Argon2id preserves exact pasted input and parameters without exposing password", async () => {
  const hasher = createBunHasher();
  const password = "  synthetic pasted 🦊 password \n";
  const hash = await hasher.hash({ password });
  expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  expect(hash).not.toContain(password);
  expect(await hasher.verify({ password, hash })).toBe(true);
  expect(await hasher.verify({ password: password.trim(), hash })).toBe(false);
  expect(
    await hasher.verify({ password: "another synthetic password", hash }),
  ).toBe(false);
});
test("malformed scalar encoding is refused before cryptographic UTF8 conversion", async () => {
  const hasher = createBunHasher();
  await expect(hasher.hash({ password: "long enough \ud800" })).rejects.toThrow(
    "Invalid password",
  );
});
