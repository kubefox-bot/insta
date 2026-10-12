import type { RedisClient } from "bun";
import { evaluateFenced } from "../../../../../../lib/dragonfly/index";
import type { EmailJobs } from "../../../ports/registration/email-jobs";
import { claimMailJob } from "./claim";
import { registrationQueue } from "./conts";
import { prepareMailJob } from "./prepare";
import { ownerGuard } from "./scripts";

/**
 * Собирает операции mail-очереди для конкретного consumer; Redis заимствован,
 * подтверждение и повтор защищены владением job и поколением.
 */
export const createDragonflyEmailJobs = ({
  client,
  consumer,
  clock,
  namespace = "users:registration",
}: Readonly<{
  client: RedisClient;
  consumer: string;
  clock: () => number;
  namespace?: string;
}>): EmailJobs => {
  const stream = `${namespace}:mail`;
  return {
    next: claimMailJob({ client, consumer, namespace }),
    prepare: prepareMailJob({ client, namespace, consumer, clock }),
    /**
     * Для принадлежащего consumer job удаляет payload, фиксирует итог delivery и удаляет
     * stream-запись после ACK; stale-владелец отсеивается Lua guard.
     */
    finish: async (job, outcome) => {
      await evaluateFenced({
        client,
        generation: job.generation,
        keys: [
          stream,
          `${namespace}:payload:${job.version}`,
          `${namespace}:delivery:${job.version}`,
        ],
        arguments: [registrationQueue.group, job.id, consumer, outcome],
        script: `${ownerGuard}
redis.call('DEL', KEYS[3])
if ARGV[5] == 'accepted' or ARGV[5] == 'stale' then redis.call('DEL', KEYS[4]) else redis.call('HSET', KEYS[4], 'state', 'failed') end
redis.call('XACK', KEYS[2], ARGV[2], ARGV[3])
redis.call('XDEL', KEYS[2], ARGV[3])
return 1
`,
      });
    },
    /**
     * Отмечает принадлежащий consumer job для повтора; при исчерпании попыток удаляет
     * payload и завершает stream-запись, иначе оставляет её reclaimable.
     */
    retry: async (job) => {
      await evaluateFenced({
        client,
        generation: job.generation,
        keys: [
          stream,
          `${namespace}:delivery:${job.version}`,
          `${namespace}:payload:${job.version}`,
        ],
        arguments: [
          registrationQueue.group,
          job.id,
          consumer,
          String(registrationQueue.attempts),
        ],
        script: `${ownerGuard}
local attempts = tonumber(redis.call('HGET', KEYS[3], 'attempts') or '0')
redis.call('HSET', KEYS[3], 'state', 'retry')
if attempts >= tonumber(ARGV[5]) then
 redis.call('HSET', KEYS[3], 'state', 'failed')
 redis.call('DEL', KEYS[4])
 redis.call('XACK', KEYS[2], ARGV[2], ARGV[3])
 redis.call('XDEL', KEYS[2], ARGV[3])
end
return 1
`,
      });
    },
  };
};
