import type { RedisClient } from "bun";
import { z } from "zod";
import {
  evaluateFenced,
  readGeneration,
} from "../../../../lib/dragonfly/index";
import type { Jobs } from "../../ports/jobs";
import { supportStream, supportStreamMaxLength } from "./conts";

const messages = z.array(
  z.tuple([z.string(), z.tuple([z.literal("taskId"), z.string()])]),
);
/**
 * Связывает best-effort сигналы доставки со Streams заимствованного клиента; durable
 * recovery остаётся в Mongo.
 */
export const createSupportJobs = (
  client: RedisClient,
  stream: string = supportStream,
): Jobs => ({
  /**
   * Добавляет report id в ограниченный по приблизительной длине stream через fencing
   * поколения.
   */
  publish: async (reportId) => {
    await evaluateFenced({
      client,
      generation: await readGeneration(client),
      script:
        "return redis.call('XADD', KEYS[2], 'MAXLEN', '~', ARGV[3], '*', 'taskId', ARGV[2])",
      keys: [stream],
      arguments: [reportId, String(supportStreamMaxLength)],
    });
  },
  /**
   * Читает и валидирует первый сигнал без его удаления или захвата; пустой stream
   * возвращает null.
   */
  next: async () => {
    const generation = await readGeneration(client);
    const entries = messages.parse(
      await evaluateFenced({
        client,
        generation,
        script: "return redis.call('XRANGE', KEYS[2], '-', '+', 'COUNT', '1')",
        keys: [stream],
      }),
    );
    const first = entries[0];
    return first ? { id: first[0], reportId: first[1][1] } : null;
  },
  /**
   * Удаляет обработанный сигнал по stream id через fencing; состояние самого отчёта не
   * меняет.
   */
  acknowledge: async (id) => {
    await evaluateFenced({
      client,
      generation: await readGeneration(client),
      script: "return redis.call('XDEL', KEYS[2], ARGV[2])",
      keys: [stream],
      arguments: [id],
    });
  },
});
