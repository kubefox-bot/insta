import { capacityDayMs, capacityEvent } from "./events";
import { authProbe, isOom, memory } from "./measure";
import type { CapacityEnvironment, CapacityTotals } from "./types";

const appendWave = async (input: CapacityEnvironment, cursor: number) => {
  let inserted = 0;
  let encodedBytes = 0;
  const bytesByType: Record<string, number> = {};
  for (const slot of input.slots) {
    const event = capacityEvent({
      stream: slot.stream,
      cursor,
      count: input.count,
      nowMs: input.nowMs,
    });
    try {
      await input.adapter.append({ lease: slot.lease, event });
    } catch (error) {
      if (!isOom(error)) throw error;
      return { inserted, encodedBytes, bytesByType, oom: true };
    }
    inserted += 1;
    const bytes = Buffer.byteLength(JSON.stringify(event));
    encodedBytes += bytes;
    bytesByType[event.eventType] = (bytesByType[event.eventType] ?? 0) + bytes;
  }
  return { inserted, encodedBytes, bytesByType, oom: false };
};
/** Обновляет только новый локально принадлежащий accumulator измерения. */
const accumulate = (totals: CapacityTotals, wave: Readonly<CapacityTotals>) => {
  totals.inserted += wave.inserted;
  totals.encodedBytes += wave.encodedBytes;
  for (const [type, bytes] of Object.entries(wave.bytesByType))
    totals.bytesByType[type] = (totals.bytesByType[type] ?? 0) + bytes;
};
/** Публикует только полностью записанные checkpoints каждого fan-out stream. */
const publishHead = async (input: CapacityEnvironment, cursor: number) => {
  for (const slot of input.slots)
    await input.adapter.publishReady({
      lease: slot.lease,
      head: { ...slot.after, cursor },
      expiresAt: input.nowMs + capacityDayMs,
    });
};
export const fillCapacity = async (input: CapacityEnvironment) => {
  const totals: CapacityTotals = {
    inserted: 0,
    encodedBytes: 0,
    bytesByType: {},
  };
  let oom = false;
  const samples: unknown[] = [];
  const controls = input.slots.map(() => new AbortController());
  const readers = input.slots.map((slot, index) => {
    const control = controls[index];
    if (!control) throw new Error("Missing control");
    return input.adapter.watch({
      stream: slot.stream,
      after: slot.after,
      signal: control.signal,
      onAvailable: async () => {},
    });
  });
  try {
    for (let cursor = 1; cursor <= input.count && !oom; cursor += 1) {
      const wave = await appendWave(input, cursor);
      accumulate(totals, wave);
      oom = wave.oom;
      if (cursor % 4096 !== 0 && cursor !== input.count && !oom) continue;
      samples.push({
        phase: "fill",
        inserted: totals.inserted,
        ...(await memory(input.client)),
        auth: await authProbe(input.authClient),
      });
      if (oom) break;
      await publishHead(input, cursor);
    }
  } finally {
    for (const control of controls) control.abort();
    await Promise.all(readers);
    for (const slot of input.slots)
      await input.adapter.release({ lease: slot.lease });
  }
  return { ...totals, oom, samples };
};
