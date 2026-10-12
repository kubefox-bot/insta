import { inspectionPolicy } from "../conts";
import { parseBoxes, requireBox } from "./boxes";
import { isoLayout } from "./conts";
import { readDecodeTime, readFragmentDefaults } from "./fragment";
import { readRun } from "./run";
import type { IsoBox, IsoSample } from "./types";

/**
 * Извлекает уникальные track id и положительные timescale; edit list отклоняет как
 * неподдержанный способ изменения timeline.
 */
const readTimescales = ({
  view,
  moov,
}: Readonly<{ view: DataView; moov: IsoBox }>) => {
  const scales = new Map<number, number>();
  for (const track of moov.children.filter((box) => box.type === "trak")) {
    if (track.children.some((box) => box.type === "edts"))
      throw new Error("Unsupported movie edit list");
    const header = requireBox(track.children, "tkhd");
    const mdia = requireBox(track.children, "mdia");
    const mdhd = requireBox(mdia.children, "mdhd");
    const id = view.getUint32(
      header.data +
        (view.getUint8(header.data) === 1
          ? isoLayout.trackIdOffsets.long
          : isoLayout.trackIdOffsets.short),
    );
    const scale = view.getUint32(
      mdhd.data +
        (view.getUint8(mdhd.data) === 1
          ? isoLayout.timescaleOffsets.long
          : isoLayout.timescaleOffsets.short),
    );
    if (scale <= 0 || scales.has(id))
      throw new Error("Invalid track timescale");
    scales.set(id, scale);
  }
  return scales;
};
/**
 * Читает trex defaults длительности и размера для fragment tracks, проверяя точную длину
 * каждого payload.
 */
const readDefaults = ({
  view,
  moov,
}: Readonly<{ view: DataView; moov: IsoBox }>) => {
  const defaults = new Map<
    number,
    Readonly<{ duration: number; size: number }>
  >();
  for (const box of requireBox(moov.children, "mvex").children.filter(
    (box) => box.type === "trex",
  )) {
    if (box.end - box.data !== isoLayout.fragmentDefaultsBytes)
      throw new Error("Track defaults bounds");
    defaults.set(view.getUint32(box.data + isoLayout.wordBytes), {
      duration: view.getUint32(box.data + isoLayout.trackIdOffsets.short),
      size: view.getUint32(box.data + isoLayout.extendedHeaderBytes),
    });
  }
  return defaults;
};
/**
 * Собирает sample inventory из moof/traf/trun, передавая decode time и смещение между
 * runs и соблюдая общий sample budget.
 */
const readSamples = ({
  view,
  boxes,
  moov,
}: Readonly<{ view: DataView; boxes: readonly IsoBox[]; moov: IsoBox }>) => {
  const defaults = readDefaults({ view, moov });
  const mdats = boxes.filter((box) => box.type === "mdat");
  const samples: IsoSample[] = [];
  for (const moof of boxes.filter((box) => box.type === "moof")) {
    for (const traf of moof.children.filter((box) => box.type === "traf")) {
      const config = readFragmentDefaults({
        view,
        box: requireBox(traf.children, "tfhd"),
        moofStart: moof.start,
        defaults,
      });
      const time = requireBox(traf.children, "tfdt");
      let decodeTime = readDecodeTime({ view, box: time });
      let previousEnd: number | undefined;
      for (const box of traf.children.filter((box) => box.type === "trun")) {
        const run = readRun({
          view,
          box,
          defaults: config,
          decodeTime,
          ...(previousEnd === undefined ? {} : { previousEnd }),
          mdats,
          remainingSamples: isoLayout.maxSamples - samples.length,
        });
        run.samples.forEach((sample) => {
          samples.push(sample);
        });
        decodeTime = run.decodeTime;
        previousEnd = run.end;
      }
    }
  }
  return samples;
};
/**
 * Проверяет завершённость fragmented MP4 по ftyp/moov/mfra и двум track timescale.
 * Длительность выводит из максимального доказанного конца samples, не из одной декларации
 * metadata.
 */
export const inspectIso = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = parseBoxes({ view, start: 0, end: bytes.byteLength });
  requireBox(boxes, "ftyp");
  const moov = requireBox(boxes, "moov");
  const mfra = requireBox(boxes, "mfra");
  const end = requireBox(mfra.children, "mfro");
  if (
    mfra.end !== bytes.byteLength ||
    view.getUint32(end.data + isoLayout.wordBytes) !== mfra.end - mfra.start
  )
    throw new Error("Incomplete movie");
  const scales = readTimescales({ view, moov });
  const samples = readSamples({ view, boxes, moov });
  if (!samples.length || scales.size !== 2)
    throw new Error("Missing media tracks");
  const maximumEnd = samples.reduce((maximum, sample) => {
    const scale = scales.get(sample.trackId);
    if (!scale) throw new Error("Unknown sample track");
    const end = (sample.timestamp + sample.duration) / scale;
    if (!Number.isFinite(end) || end <= 0)
      throw new Error("Unproven sample end");
    return Math.max(maximum, end);
  }, 0);
  return {
    samples,
    scales,
    durationMs: maximumEnd * inspectionPolicy.millisecondsPerSecond,
  };
};
