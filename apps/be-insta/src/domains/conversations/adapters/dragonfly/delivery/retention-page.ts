import { retentionPolicy } from "./conts";
import { tryRetentionLease } from "./retention-lease";
import { retainStream } from "./retention-stream";
import { parseOwnedKey } from "./scan";
import type {
  RetentionProgress,
  RetentionTurn,
  StreamsDependencies,
} from "./types";

/** Проверяет ownership ключа до аренды; неизвестные и чужие поколения никогда не становятся кандидатами trim. */
const retainCurrentKey = async (
  input: RetentionTurn & Readonly<{ key: string; generation: string }>,
  dependencies: StreamsDependencies,
) => {
  const owned = parseOwnedKey(input.key);
  if (
    !owned ||
    owned.generation !== input.generation ||
    owned.suffix !== "state" ||
    input.visited.has(input.key)
  )
    return;
  const lease = await tryRetentionLease(
    {
      stream: owned.stream,
      generation: input.generation,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    dependencies,
  );
  if (lease)
    await retainStream(
      {
        lease,
        nowMs: input.nowMs,
        ...(input.signal ? { signal: input.signal } : {}),
      },
      dependencies,
    );
  input.visited.add(input.key);
};
/** Сдвигает остаток только после settlement ключа; ошибка оставляет его для следующего bounded turn. */
export const drainRetentionPage = async (
  {
    progress,
    turn,
  }: Readonly<{ progress: RetentionProgress; turn: RetentionTurn }>,
  dependencies: StreamsDependencies,
) => {
  while (
    progress.remainder.length &&
    turn.visited.size < retentionPolicy.streamsPerTurn
  ) {
    turn.signal?.throwIfAborted();
    const key = progress.remainder[0];
    if (key === undefined) throw new Error("Missing retention key");
    await retainCurrentKey(
      { ...turn, key, generation: progress.generation },
      dependencies,
    );
    progress.remainder.shift();
  }
};
