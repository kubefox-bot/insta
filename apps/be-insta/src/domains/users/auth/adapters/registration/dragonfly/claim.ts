import type { RedisClient } from "bun";
import { z } from "zod";
import {
  evaluateFenced,
  readGeneration,
} from "../../../../../../lib/dragonfly/index";
import type { EmailJobs } from "../../../ports/registration/email-jobs";
import { registrationQueue } from "./conts";
import { retireRegistrationQueues } from "./retire";

const entrySchema = z.tuple([z.string(), z.array(z.string())]);
const jobSchema = z.object({
  challengeId: z.string(),
  version: z.string(),
  generation: z.string(),
});
/**
 * Создаёт получение одного mail job: при новом поколении очищает прежние очереди, затем
 * предпочитает reclaim pending-записи свежей; null означает пустую очередь.
 */
export const claimMailJob = ({
  client,
  consumer,
  namespace,
}: Readonly<{
  client: RedisClient;
  consumer: string;
  namespace: string;
}>): EmailJobs["next"] => {
  const stream = `${namespace}:mail`;
  let observedGeneration: string | undefined;
  return async () => {
    const generation = await readGeneration(client);
    if (observedGeneration !== generation) {
      await retireRegistrationQueues({ client, generation, namespace });
      observedGeneration = generation;
    }
    const raw = await evaluateFenced({
      client,
      generation,
      keys: [stream],
      arguments: [
        registrationQueue.group,
        consumer,
        String(registrationQueue.reclaimMs),
      ],
      script: `
local group = redis.pcall('XGROUP', 'CREATE', KEYS[2], ARGV[2], '0', 'MKSTREAM')
if type(group) == 'table' and group.err and not string.find(group.err, 'BUSYGROUP') then return redis.error_reply(group.err) end
local reclaimed = redis.call('XAUTOCLAIM', KEYS[2], ARGV[2], ARGV[3], ARGV[4], '0-0', 'COUNT', 1)
if #reclaimed[2] > 0 then return reclaimed[2][1] end
local fresh = redis.call('XREADGROUP', 'GROUP', ARGV[2], ARGV[3], 'COUNT', 1, 'STREAMS', KEYS[2], '>')
if not fresh or not fresh[1] then return nil end
return fresh[1][2][1]
`,
    });
    if (raw === null) return null;
    const [id, pairs] = entrySchema.parse(raw);
    const fields: Record<string, string> = {};
    for (let index = 0; index < pairs.length; index += 2) {
      const key = pairs[index];
      const value = pairs[index + 1];
      if (key !== undefined && value !== undefined) fields[key] = value;
    }
    return { id, ...jobSchema.parse(fields) };
  };
};
