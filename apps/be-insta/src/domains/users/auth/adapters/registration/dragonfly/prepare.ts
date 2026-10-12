import type { RedisClient } from "bun";
import { z } from "zod";
import { evaluateFenced } from "../../../../../../lib/dragonfly/index";
import { otpPolicy } from "../../../domain/registration/conts";
import type { EmailJobs } from "../../../ports/registration/email-jobs";
import { registrationQueue } from "./conts";
import { ownerGuard, registrationClockLua } from "./scripts";
/**
 * Создаёт подготовку принадлежащего consumer письма: проверяет challenge и предел
 * попыток, атомарно увеличивает attempts; возвращает ready, exhausted или отсутствие
 * актуального payload.
 */
export const prepareMailJob = ({
  client,
  namespace,
  consumer,
  clock,
}: Readonly<{
  client: RedisClient;
  namespace: string;
  consumer: string;
  clock: () => number;
}>): EmailJobs["prepare"] => {
  const stream = `${namespace}:mail`;
  return async (job) => {
    const raw = await evaluateFenced({
      client,
      generation: job.generation,
      keys: [
        stream,
        `${namespace}:challenge:${job.challengeId}`,
        `${namespace}:payload:${job.version}`,
        `${namespace}:delivery:${job.version}`,
      ],
      arguments: [
        registrationQueue.group,
        job.id,
        consumer,
        job.version,
        String(clock()),
        String(registrationQueue.attempts),
        String(otpPolicy.errors),
      ],
      script: `${registrationClockLua}${ownerGuard}
local value = redis.call('GET', KEYS[3])
local payload = redis.call('GET', KEYS[4])
if not value or not payload then return nil end
local challenge = cjson.decode(value)
local now = currentTime(ARGV[6])
if challenge.version ~= ARGV[5] or challenge.consumed or challenge.registrationExpiresAt <= now or challenge.errors >= tonumber(ARGV[8]) then return nil end
local attempts = tonumber(redis.call('HGET', KEYS[5], 'attempts') or '0')
if attempts >= tonumber(ARGV[7]) then return {'EXHAUSTED'} end
redis.call('HINCRBY', KEYS[5], 'attempts', 1)
redis.call('PEXPIRE', KEYS[5], challenge.registrationExpiresAt-now)
return {payload, tostring(challenge.registrationExpiresAt), tostring(challenge.errors)}
`,
    });
    if (raw === null) return null;
    if (Array.isArray(raw) && raw[0] === "EXHAUSTED")
      return { state: "exhausted" };
    const [ciphertext, expiry, errors] = z
      .tuple([z.string(), z.coerce.number(), z.coerce.number()])
      .parse(raw);
    return { state: "ready", ciphertext, expiresAt: expiry, errors };
  };
};
