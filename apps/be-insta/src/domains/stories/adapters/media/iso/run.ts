import { isoLayout, runFlags } from "./conts";
import { BoxReader } from "./reader";
import type { FragmentDefaults, IsoBox, IsoSample } from "./types";

/**
 * Читает длительность, размер и composition offset sample с учётом флагов/version;
 * недоказуемые размер или длительность отклоняет.
 */
const sampleFields = ({
  reader,
  flags,
  version,
  defaults,
}: Readonly<{
  reader: BoxReader;
  flags: number;
  version: number;
  defaults: FragmentDefaults;
}>) => {
  const duration = reader.optionalUnsigned(
    flags & runFlags.duration,
    defaults.duration,
  );
  const size = reader.optionalUnsigned(flags & runFlags.size, defaults.size);
  reader.optionalUnsigned(flags & runFlags.flags, 0);
  const composition =
    version === 1
      ? reader.optionalSigned(flags & runFlags.composition, 0)
      : reader.optionalUnsigned(flags & runFlags.composition, 0);
  if (duration <= 0 || size <= 0) throw new Error("Unproven sample duration");
  return { duration, size, composition };
};
/**
 * Разбирает trun в пределах sample budget, проверяя размер таблицы и попадание каждого
 * sample в mdat. Возвращает конец данных и decode time для следующего run.
 */
export const readRun = ({
  view,
  box,
  defaults,
  decodeTime,
  previousEnd,
  mdats,
  remainingSamples,
}: Readonly<{
  view: DataView;
  box: IsoBox;
  defaults: FragmentDefaults;
  decodeTime: number;
  previousEnd?: number;
  mdats: readonly IsoBox[];
  remainingSamples: number;
}>) => {
  const reader = new BoxReader(view, box);
  const header = reader.unsigned();
  const flags = header & isoLayout.fullBoxFlagsMask;
  const version = header >>> isoLayout.versionShift;
  if (version !== 0 && version !== 1) throw new Error("Run version");
  const count = reader.unsigned();
  if (count > remainingSamples) throw new Error("Sample budget");
  const start =
    flags & runFlags.offset ? defaults.base + reader.signed() : previousEnd;
  if (start === undefined) throw new Error("Unknown sample offset");
  reader.optionalUnsigned(flags & runFlags.firstFlags, 0);
  const fields = [
    runFlags.duration,
    runFlags.size,
    runFlags.flags,
    runFlags.composition,
  ].filter((flag) => flags & flag).length;
  if (
    fields === 0 ||
    count * fields * isoLayout.wordBytes !== reader.remaining()
  )
    throw new Error("Sample table bounds");
  const samples: IsoSample[] = [];
  let cursor = start;
  let timestamp = decodeTime;
  for (let index = 0; index < count; index++) {
    const sample = sampleFields({ reader, flags, version, defaults });
    if (
      !mdats.some(
        (mdat) => cursor >= mdat.data && cursor + sample.size <= mdat.end,
      )
    )
      throw new Error("Sample bounds");
    samples.push({
      trackId: defaults.trackId,
      start: cursor,
      size: sample.size,
      duration: sample.duration,
      timestamp: timestamp + sample.composition,
    });
    cursor += sample.size;
    timestamp += sample.duration;
  }
  reader.finish();
  return { samples, end: cursor, decodeTime: timestamp };
};
