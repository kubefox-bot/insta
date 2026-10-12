import { launchDecoder } from "../launch-decoder";
import { readDecoder } from "../read-decoder";
import type { DecoderLauncher } from "../types";
import { webmPolicy } from "./conts";
import { decodedRows } from "./decoded-rows";
import type { DecodedRow, WebmInventory, WebmPacket, WebmTrack } from "./types";

/**
 * Сверяет decoder stream index/codec с inventory, дополнительно проверяя число каналов
 * Opus.
 */
const verifyStream = ({
  row,
  tracks,
}: Readonly<{
  row: Extract<DecodedRow, readonly ["stream", ...unknown[]]>;
  tracks: readonly WebmTrack[];
}>) => {
  const [, index, codec] = row;
  const track = tracks[index];
  if (!track || codec !== track.codec) return false;
  return codec !== "opus" || row[5] === track.channels;
};
/**
 * Сопоставляет декодированный кадр с packet по размеру и точному PTS; затем проверяет
 * audio samples либо video dimensions.
 */
const verifyFrame = ({
  row,
  track,
  packet,
}: Readonly<{
  row: Extract<DecodedRow, readonly ["frame", ...unknown[]]>;
  track: WebmTrack | undefined;
  packet: WebmPacket | undefined;
}>) => {
  const [, media, , pts, size] = row;
  if (!track || !packet || size !== packet.size) return false;
  if (
    BigInt(pts) * BigInt(webmPolicy.timestampScaleNs) !==
    BigInt(packet.timestampNs)
  )
    return false;
  if (media === "audio")
    return track.codec === "opus" && row[5] === packet.samples;
  return (
    track.codec !== "opus" && row[5] === track.width && row[6] === track.height
  );
};
/**
 * Разбирает compact строки ffprobe по схеме и передаёт их сверке полного inventory;
 * неверный формат возвращает false.
 */
export const verifyWebmOutput = ({
  output,
  inventory,
}: Readonly<{ output: string; inventory: WebmInventory }>) => {
  const parsed = decodedRows.safeParse(
    output
      .trim()
      .split("\n")
      .map((line) => line.split("|")),
  );
  if (!parsed.success) return false;
  return verifyRows({ rows: parsed.data, inventory });
};
/**
 * Требует ровно две уникальные decoder streams и покадровое совпадение каждой дорожки с
 * inventory, включая итоговое число кадров.
 */
const verifyRows = ({
  rows,
  inventory,
}: Readonly<{ rows: readonly DecodedRow[]; inventory: WebmInventory }>) => {
  const streams = rows.filter((row) => row[0] === "stream");
  if (
    streams.length !== webmPolicy.trackCount ||
    new Set(streams.map((row) => row[1])).size !== webmPolicy.trackCount
  )
    return false;
  if (!streams.every((row) => verifyStream({ row, tracks: inventory.tracks })))
    return false;
  const counts = inventory.tracks.map(() => 0);
  const packets = inventory.tracks.map((track) =>
    inventory.packets.filter((packet) => packet.track === track.number),
  );
  for (const row of rows.filter((row) => row[0] === "frame")) {
    const index = row[2];
    const count = counts[index] ?? 0;
    if (
      !verifyFrame({
        row,
        track: inventory.tracks[index],
        packet: packets[index]?.[count],
      })
    )
      return false;
    counts[index] = count + 1;
  }
  return counts.every((count, index) => count === packets[index]?.length);
};
/**
 * Запускает ffprobe с WebM-профилем и подтверждает его ограниченный output против packet
 * inventory; отсутствие корректного output возвращает false.
 */
export const verifyWebmDecoding = async ({
  bytes,
  signal,
  inventory,
  launch = launchDecoder,
}: Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  signal: AbortSignal;
  inventory: WebmInventory;
  launch?: DecoderLauncher;
}>) => {
  const output = await readDecoder({
    child: launch(bytes, { container: "webm" }),
    signal,
  });
  return output !== null && verifyWebmOutput({ output, inventory });
};
