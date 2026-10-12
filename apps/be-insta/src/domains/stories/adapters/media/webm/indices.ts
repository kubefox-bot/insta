import { ebmlId, webmPolicy } from "./conts";
import { one, readUnsigned } from "./reader";
import type { Element, WebmInventory } from "./types";

type IndexInput = Readonly<{
  bytes: Uint8Array;
  segment: Element;
  packets: WebmInventory["packets"];
  tracks: WebmInventory["tracks"];
}>;
/**
 * Проверяет, что каждая Seek-ссылка указывает на начало дочернего элемента segment с
 * заявленным ID.
 */
const verifySeek = ({ bytes, segment }: IndexInput) => {
  for (const head of segment.children.filter(
    (node) => node.id === ebmlId.seekHead,
  )) {
    for (const seek of head.children.filter(
      (node) => node.id === ebmlId.seek,
    )) {
      const id = readUnsigned(bytes, one(seek.children, ebmlId.seekId));
      const position = readUnsigned(
        bytes,
        one(seek.children, ebmlId.seekPosition),
      );
      if (
        !segment.children.some(
          (node) => node.start === segment.data + position && node.id === id,
        )
      )
        throw Error("Invalid Seek target");
    }
  }
};
/**
 * Разрешает Cue по относительному offset либо ordinal; если заданы оба, требует одну цель
 * и извлекает Block из BlockGroup.
 */
const cueBlock = ({
  bytes,
  cluster,
  position,
}: Readonly<{ bytes: Uint8Array; cluster: Element; position: Element }>) => {
  const relative = position.children.find(
    (node) => node.id === ebmlId.cueRelative,
  );
  const ordinal = position.children.find((node) => node.id === ebmlId.cueBlock);
  const blocks = cluster.children.filter(
    (node) => node.id === ebmlId.simpleBlock || node.id === ebmlId.group,
  );
  const index = (ordinal ? readUnsigned(bytes, ordinal) : 1) - 1;
  const target = relative
    ? blocks.find(
        (node) => node.start === cluster.data + readUnsigned(bytes, relative),
      )
    : blocks[index];
  if (!target) throw Error("Invalid Cue block");
  if (relative && ordinal && target !== blocks[index])
    throw Error("Inconsistent Cue block");
  return target.id === ebmlId.group
    ? one(target.children, ebmlId.block)
    : target;
};
/**
 * Сверяет Cue track/cluster/block с реальным packet inventory и точным presentation
 * timestamp.
 */
const verifyCuePosition = ({
  input,
  position,
  timestamp,
}: Readonly<{ input: IndexInput; position: Element; timestamp: number }>) => {
  const { bytes, segment, tracks, packets } = input;
  const track = readUnsigned(bytes, one(position.children, ebmlId.cueTrack));
  const offset = readUnsigned(bytes, one(position.children, ebmlId.cueCluster));
  const cluster = segment.children.find(
    (node) =>
      node.id === ebmlId.cluster && node.start === segment.data + offset,
  );
  if (!cluster || !tracks.some((item) => item.number === track))
    throw Error("Invalid Cue cluster/track");
  const block = cueBlock({ bytes, cluster, position });
  if (
    !packets.some(
      (packet) =>
        packet.blockStart === block.start &&
        packet.track === track &&
        packet.timestampNs === timestamp * webmPolicy.timestampScaleNs,
    )
  )
    throw Error("Cue timestamp mismatch");
};
/**
 * Проверяет Seek, позиции clusters и все Cue-точки; cue без позиции либо с неверной
 * ссылкой отклоняет.
 */
export const verifyIndices = (input: IndexInput) => {
  verifySeek(input);
  verifyClusterPositions(input);
  for (const cues of input.segment.children.filter(
    (node) => node.id === ebmlId.cues,
  )) {
    for (const cue of cues.children.filter((node) => node.id === ebmlId.cue)) {
      const timestamp = readUnsigned(
        input.bytes,
        one(cue.children, ebmlId.cueTime),
      );
      const positions = cue.children.filter(
        (node) => node.id === ebmlId.cuePosition,
      );
      if (!positions.length) throw Error("Missing Cue position");
      for (const position of positions)
        verifyCuePosition({ input, position, timestamp });
    }
  }
};
/**
 * Сверяет заявленные Cluster Position и PrevSize с фактическими границами текущего и
 * предыдущего cluster.
 */
const verifyClusterPositions = ({ bytes, segment }: IndexInput) => {
  let previous: Element | undefined;
  for (const cluster of segment.children.filter(
    (node) => node.id === ebmlId.cluster,
  )) {
    const position = cluster.children.find(
      (node) => node.id === ebmlId.clusterPosition,
    );
    if (
      position &&
      readUnsigned(bytes, position) !== cluster.start - segment.data
    )
      throw Error("Invalid Cluster Position");
    const prevSize = cluster.children.find(
      (node) => node.id === ebmlId.prevSize,
    );
    if (
      prevSize &&
      (!previous ||
        readUnsigned(bytes, prevSize) !== previous.end - previous.start)
    )
      throw Error("Invalid PrevSize");
    previous = cluster;
  }
};
