import { readBlock } from "./block";
import { ebmlId, webmPolicy } from "./conts";
import { one, readUnsigned } from "./reader";
import { verifyTimeline } from "./timeline";
import type { Element, WebmPacket, WebmTrack } from "./types";
/**
 * Собирает packets всех clusters в пределах общего packet budget и проверяет timeline
 * каждой дорожки перед возвратом inventory.
 */
export const readBlocks = ({
  bytes,
  nodes,
  tracks,
}: Readonly<{
  bytes: Uint8Array;
  nodes: readonly Element[];
  tracks: readonly WebmTrack[];
}>) => {
  const packets: WebmPacket[] = [];
  for (const cluster of nodes.filter((node) => node.id === ebmlId.cluster)) {
    const timestamp = readUnsigned(
      bytes,
      one(cluster.children, ebmlId.timestamp),
    );
    for (const child of cluster.children.filter(
      (node) => node.id === ebmlId.simpleBlock || node.id === ebmlId.group,
    )) {
      const frames = readBlock({ bytes, child, tracks, timestamp });
      if (packets.length + frames.length > webmPolicy.maxPackets)
        throw Error("WebM packet budget");
      packets.push(...frames);
    }
  }
  verifyTimeline({ packets, tracks });
  return packets;
};
