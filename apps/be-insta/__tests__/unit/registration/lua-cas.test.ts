import { expect, test } from "bun:test";
import { LuaFactory } from "wasmoon";
import {
  enqueueLua,
  verifyLua,
} from "../../../src/domains/users/auth/adapters/registration/dragonfly/scripts";

const runChallengeScript = async (
  script: string,
  scriptArgs: readonly string[],
) => {
  const args = scriptArgs.map((value) => JSON.stringify(value)).join(", ");
  const fixture = `
local stored = {
 challengeId = 'same-email', version = 'new-instance', revision = 1,
 registrationExpiresAt = 2000000, nextSendAt = 0, errors = 0,
 consumed = false, ciphertext = 'new-secret'
}
local candidate = {
 challengeId = 'same-email', version = 'replacement', revision = 2,
 registrationExpiresAt = 2000000, nextSendAt = 1000000, errors = 0,
 consumed = false, ciphertext = 'replacement-secret'
}
local writes = 0
redis = { call = function(command, ...)
 if command == 'GET' then return 'stored' end
 if command == 'TIME' then return {1000, 0} end
 if command == 'SET' or command == 'XADD' or command == 'DEL' then
  writes = writes + 1
  return 'OK'
 end
 error('Unexpected Redis command: ' .. command)
end }
cjson = {
 decode = function(value) if value == 'stored' then return stored end return candidate end,
 encode = function(_) return 'encoded' end
}
KEYS = {'generation', 'challenge', 'mail', 'payload', 'old-payload'}
ARGV = {${args}}
local reply = assert(load([==[${script}]==]))()
return table.concat({
 type(reply) == 'table' and reply[1] or reply,
 tostring(writes), tostring(stored.revision), tostring(stored.errors),
 tostring(stored.consumed)
}, string.char(10))
`;
  const lua = await new LuaFactory().createEngine();
  try {
    return String(await lua.doString(fixture)).split("\n");
  } finally {
    lua.global.close();
  }
};

test("stale verification cannot consume a new challenge with the same revision", async () => {
  expect(
    await runChallengeScript(verifyLua, [
      "generation",
      "1",
      "1000000",
      "1",
      "5",
      "old-instance",
    ]),
  ).toEqual(["REGISTRATION_CONFLICT", "0", "1", "0", "false"]);
});

test("stale wrong code cannot charge attempts to a new challenge", async () => {
  expect(
    await runChallengeScript(verifyLua, [
      "generation",
      "1",
      "1000000",
      "0",
      "5",
      "old-instance",
    ]),
  ).toEqual(["REGISTRATION_CONFLICT", "0", "1", "0", "false"]);
});

test("stale resend cannot replace a new challenge with the same revision", async () => {
  expect(
    await runChallengeScript(enqueueLua, [
      "generation",
      "1",
      "candidate",
      "1000000",
      "mail",
      "operation",
      "group",
      "5",
      "old-instance",
    ]),
  ).toEqual(["REGISTRATION_CONFLICT", "0", "1", "0", "false"]);
});

test("current challenge version still permits verification and resend", async () => {
  expect(
    await runChallengeScript(verifyLua, [
      "generation",
      "1",
      "1000000",
      "1",
      "5",
      "new-instance",
    ]),
  ).toEqual(["OK", "1", "2", "0", "true"]);
  expect(
    await runChallengeScript(enqueueLua, [
      "generation",
      "1",
      "candidate",
      "1000000",
      "mail",
      "operation",
      "group",
      "5",
      "new-instance",
    ]),
  ).toEqual(["OK", "4", "1", "0", "false"]);
});
