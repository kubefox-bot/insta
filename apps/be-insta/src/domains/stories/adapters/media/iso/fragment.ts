import { fragmentHeaderFlags, isoLayout } from "./conts";
import { BoxReader } from "./reader";
import type { FragmentDefaults, IsoBox } from "./types";
/**
 * Разбирает tfhd и выбирает явную базу либо moof base, дополняя отсутствующие
 * размер/длительность из trex; неизвестную базу отклоняет.
 */
export const readFragmentDefaults = ({
  view,
  box,
  moofStart,
  defaults,
}: Readonly<{
  view: DataView;
  box: IsoBox;
  moofStart: number;
  defaults: ReadonlyMap<number, Readonly<{ duration: number; size: number }>>;
}>): FragmentDefaults => {
  const reader = new BoxReader(view, box);
  const flags = reader.unsigned() & isoLayout.fullBoxFlagsMask;
  const trackId = reader.unsigned();
  if (
    !(flags & fragmentHeaderFlags.base) &&
    !(flags & fragmentHeaderFlags.defaultBaseMoof)
  )
    throw new Error("Unsupported fragment base");
  const base = reader.optionalLong(flags & fragmentHeaderFlags.base, moofStart);
  reader.optionalUnsigned(flags & fragmentHeaderFlags.description, 0);
  const duration = reader.optionalUnsigned(
    flags & fragmentHeaderFlags.duration,
    defaults.get(trackId)?.duration ?? 0,
  );
  const size = reader.optionalUnsigned(
    flags & fragmentHeaderFlags.size,
    defaults.get(trackId)?.size ?? 0,
  );
  reader.optionalUnsigned(flags & fragmentHeaderFlags.flags, 0);
  reader.finish();
  return { trackId, base, duration, size };
};
/**
 * Читает tfdt version 0/1 с соответствующей шириной времени и требует полного payload без
 * лишних байтов.
 */
export const readDecodeTime = ({
  view,
  box,
}: Readonly<{ view: DataView; box: IsoBox }>) => {
  const reader = new BoxReader(view, box);
  const version = reader.unsigned() >>> isoLayout.versionShift;
  if (version !== 0 && version !== 1)
    throw new Error("Unsupported decode-time version");
  const time = version === 1 ? reader.long() : reader.unsigned();
  reader.finish();
  return time;
};
