import { z } from "zod";
import { retentionPolicy, retentionReadLua, retentionTrimLua } from "./conts";
import { materializedDeliverySchema, retentionSnapshotSchema } from "./schema";
import type { RetentionInput, StreamsDependencies } from "./types";
import { writeStream } from "./write";
/** Сверяет immutable payload и точные координаты перед fenced trim; ready и TTL не увеличивает. */
export const trimExpiredPrefix = async (
  input: RetentionInput,
  dependencies: StreamsDependencies,
) => {
  const result = await writeStream(
    {
      ...input,
      script: retentionReadLua,
      args: [String(retentionPolicy.rowsPerStream)],
    },
    dependencies,
  );
  if (result === null) return;
  const [epoch, base, tail, rows] = retentionSnapshotSchema.parse(result);
  const streamId = `${input.lease.stream.kind}:${input.lease.stream.id}`;
  const expired: typeof rows = [];
  for (const [index, row] of rows.entries()) {
    const [id, [, json]] = row;
    const event = materializedDeliverySchema.parse(JSON.parse(json));
    if (
      id !== `${event.cursor}-0` ||
      event.cursor !== Number(base) + index + 1 ||
      event.epoch !== epoch ||
      event.streamId !== streamId
    )
      throw new Error("Invalid retention coordinates");
    if (event.expiresAt > input.nowMs) break;
    expired.push(row);
  }
  if (!expired.length) return;
  const through = Number(base) + expired.length;
  z.int().nonnegative().parse(through);
  await writeStream(
    {
      ...input,
      script: retentionTrimLua,
      args: [
        epoch,
        base,
        tail,
        String(through),
        JSON.stringify(expired),
        String(input.nowMs),
      ],
    },
    dependencies,
  );
};
