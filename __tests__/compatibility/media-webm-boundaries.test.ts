import { expect, test } from "bun:test";
import { ebmlId } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/conts";
import { inspectWebm } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/inspect";
import { splitLaces } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/lacing";
import { inspectWebmPacketFile as inspectWebmWithPolicy } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/packet-file";
import { parseWebm } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/parse";
import { one } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/reader";
import { presentationHorizon as horizonWithPolicy } from "../../apps/be-insta/src/domains/stories/domain/media/horizon";

const inspectWebmPacketFile = (bytes: Uint8Array) =>
  inspectWebmWithPolicy({ bytes, maxDurationMs: 15000 });
const presentationHorizon = (
  evidence: Omit<Parameters<typeof horizonWithPolicy>[0], "maxDurationMs">,
) => horizonWithPolicy({ ...evidence, maxDurationMs: 15000 });

const native = async (name = "chrome-vp8") =>
  new Uint8Array(
    await Bun.file(
      new URL(`../fixtures/media/webm/${name}.webm`, import.meta.url),
    ).arrayBuffer(),
  );
const inspect = (bytes: Uint8Array) => inspectWebmPacketFile(bytes).toJSON();
const horizon = (overNs = 0) =>
  presentationHorizon({
    metadataMs: 15000,
    audio: [{ timestampNs: 14940000000 + overNs, samples: 2880 }],
    video: [{ timestampNs: 14900000000, durationNs: null }],
  }).toJSON();
test("exact rational sample ends accept15000 but reject a1ns overrun without rounding", () => {
  expect(horizon()).toMatchObject({ tag: "Ok", value: 15000 });
  expect(horizon(1)).toMatchObject({ tag: "Error", error: "TOO_LONG" });
  expect(
    presentationHorizon({
      metadataMs: 15000,
      audio: [{ timestampNs: 14999979167, samples: 1 }],
      video: [{ timestampNs: 14900000000, durationNs: null }],
    }).toJSON(),
  ).toMatchObject({ tag: "Error", error: "TOO_LONG" });
});
test("metadata tolerance and terminal hold never extend the security limit", () => {
  const evidence = {
    metadataMs: 15000.000001,
    audio: [{ timestampNs: 14940000000, samples: 2880 }],
    video: [{ timestampNs: 14900000000, durationNs: null }],
  };
  expect(presentationHorizon(evidence).toJSON()).toMatchObject({
    error: "TOO_LONG",
  });
  expect(presentationHorizon({ ...evidence, metadataMs: 14900 }).isOk()).toBe(
    true,
  );
  expect(
    presentationHorizon({ ...evidence, metadataMs: 14899.999 }).toJSON(),
  ).toMatchObject({ error: "DURATION_UNPROVABLE" });
  expect(
    presentationHorizon({
      ...evidence,
      metadataMs: 15000,
      video: [{ timestampNs: 14849999999, durationNs: null }],
    }).isError(),
  ).toBe(true);
  expect(
    presentationHorizon({
      ...evidence,
      metadataMs: 15000,
      video: [{ timestampNs: 15000000000, durationNs: null }],
    }).isError(),
  ).toBe(true);
  expect(
    presentationHorizon({
      ...evidence,
      metadataMs: 15000,
      video: [{ timestampNs: 14900000000, durationNs: 100000001 }],
    }).toJSON(),
  ).toMatchObject({ error: "TOO_LONG" });
});
test("positive metadata is checked; missing/zero and forged short durations fail", async () => {
  const bytes = await native();
  const segment = one(parseWebm(bytes), ebmlId.segment);
  const duration = one(
    one(segment.children, ebmlId.info).children,
    ebmlId.duration,
  );
  for (const value of [0, 1, Number.POSITIVE_INFINITY]) {
    const changed = bytes.slice();
    new DataView(changed.buffer).setFloat64(duration.data, value);
    expect(inspectWebmPacketFile(changed).isError()).toBe(true);
  }
});
test("every incomplete Block and trailing garbage fail the whole-file trust boundary", async () => {
  const bytes = await native();
  for (const removed of [1, 2, 3, 5, 40])
    expect(inspectWebmPacketFile(bytes.slice(0, -removed)).isError()).toBe(
      true,
    );
  expect(inspectWebmPacketFile(new Uint8Array([...bytes, 0])).isError()).toBe(
    true,
  );
  const segment = one(parseWebm(bytes), ebmlId.segment);
  const firstCluster = one(segment.children, ebmlId.cluster);
  // Closing the unknown Cluster early must not promote its following leaves.
  const parent = bytes.slice();
  parent.set([1, 0, 0, 0, 0, 0, 0, 1], firstCluster.data - 8);
  expect(inspectWebmPacketFile(parent).isError()).toBe(true);
});
test("valid complete-block prefix is another provided file, not proof of complete capture", async () => {
  const bytes = await native();
  const segment = one(parseWebm(bytes), ebmlId.segment);
  const cluster = segment.children
    .filter((node) => node.id === ebmlId.cluster)
    .at(-1);
  const last = cluster?.children.at(-1);
  if (!last) throw Error("fixture");
  const prefix = bytes.slice(0, last.start);
  expect(inspectWebmPacketFile(prefix).isOk()).toBe(true);
});
test("SeekHead must point to the matching real Segment element", async () => {
  const bytes = await native("msedge-vp8");
  const segment = one(parseWebm(bytes), ebmlId.segment);
  const seek = one(
    one(segment.children, ebmlId.seekHead).children,
    ebmlId.seek,
  );
  const position = one(seek.children, ebmlId.seekPosition);
  const broken = bytes.slice();
  broken[position.end - 1] = (broken[position.end - 1] ?? 0) ^ 1;
  expect(inspectWebmPacketFile(broken).isError()).toBe(true);
});
test("track references, unsupported codec and forbidden parent IDs fail", async () => {
  const bytes = await native();
  const segment = one(parseWebm(bytes), ebmlId.segment);
  const block = one(
    one(segment.children, ebmlId.cluster).children,
    ebmlId.simpleBlock,
  );
  const wrongTrack = bytes.slice();
  wrongTrack[block.data] = 0x83;
  expect(inspectWebmPacketFile(wrongTrack).isError()).toBe(true);
  const codec = one(
    one(one(segment.children, ebmlId.tracks).children, ebmlId.track).children,
    ebmlId.codec,
  );
  const wrongCodec = bytes.slice();
  wrongCodec[codec.end - 1] = 0x37;
  expect(inspect(wrongCodec)).toMatchObject({ error: "UNSUPPORTED_MEDIA" });
  const wrongParent = bytes.slice();
  wrongParent[block.start] = 0xae;
  expect(inspectWebmPacketFile(wrongParent).isError()).toBe(true);
});
test("all lacing encodings require complete positive bounded frame sizes", () => {
  const lace = (bytes: number[], mode: number) =>
    splitLaces({
      bytes: Uint8Array.from(bytes),
      start: 0,
      end: bytes.length,
      mode,
    }).map((v) => Array.from(v));
  expect(lace([1, 10, 20, 30, 40], 2)).toEqual([
    [10, 20],
    [30, 40],
  ]);
  expect(lace([1, 2, 10, 20, 30, 40, 50], 1)).toEqual([
    [10, 20],
    [30, 40, 50],
  ]);
  expect(lace([1, 0x82, 10, 20, 30, 40, 50], 3)).toEqual([
    [10, 20],
    [30, 40, 50],
  ]);
  for (const [bytes, mode] of [
    [[1, 1, 2, 3], 2],
    [[1, 255], 1],
    [[1, 0xff], 3],
    [[1, 9, 1], 1],
  ] as const)
    expect(() => lace([...bytes], mode)).toThrow();
});
test("declared EBML widths and cluster position indices cannot contradict bytes", async () => {
  const { editWebm, element, uint } = await import(
    "../fixtures/media/webm/modify"
  );
  const bytes = await native();
  const badWidth = editWebm(bytes, (node, payload) =>
    node.id === ebmlId.maxIdLength ? uint(1) : payload,
  );
  expect(inspectWebmPacketFile(badWidth).isError()).toBe(true);
  const badPosition = editWebm(bytes, (node, payload) =>
    node.id === ebmlId.cluster
      ? new Uint8Array([
          ...element(ebmlId.clusterPosition, uint(123)),
          ...payload,
        ])
      : payload,
  );
  expect(inspectWebmPacketFile(badPosition).isError()).toBe(true);
});
test("unsupported trims, transforms and extra tracks fail closed explicitly", async () => {
  const { editWebm, element, uint } = await import(
    "../fixtures/media/webm/modify"
  );
  const bytes = await native();
  for (const delay of [1, 6500000]) {
    const trimmed = editWebm(bytes, (node, payload) =>
      node.id === ebmlId.track
        ? new Uint8Array([
            ...payload,
            ...element(ebmlId.codecDelay, uint(delay)),
          ])
        : payload,
    );
    expect(inspect(trimmed)).toMatchObject({ error: "UNSUPPORTED_MEDIA" });
  }
  const padded = editWebm(bytes, (node, payload) =>
    node.id === ebmlId.simpleBlock ? payload : payload,
  );
  expect(inspectWebmPacketFile(padded).isOk()).toBe(true);
  for (const id of [0x23314f, 0x6d80]) {
    const transformed = editWebm(bytes, (node, payload) =>
      node.id === ebmlId.track
        ? new Uint8Array([...payload, ...element(id, uint(1))])
        : payload,
    );
    expect(inspectWebmPacketFile(transformed).isError()).toBe(true);
  }
  const extra = editWebm(bytes, (node, payload) =>
    node.id === ebmlId.tracks
      ? new Uint8Array([...payload, ...payload])
      : payload,
  );
  expect(inspect(extra)).toMatchObject({ error: "UNSUPPORTED_MEDIA" });
});
test("explicit video duration is evidence, missing metadata and cumulative compressed audio are rejected", async () => {
  const { editWebm, element, uint } = await import(
    "../fixtures/media/webm/modify"
  );
  const bytes = await native();
  const explicit = editWebm(bytes, (node, payload) =>
    node.id === ebmlId.track &&
    node.children.some((child) => child.id === ebmlId.video)
      ? new Uint8Array([
          ...payload,
          ...element(ebmlId.defaultDuration, uint(50000000)),
        ])
      : payload,
  );
  expect(inspectWebmPacketFile(explicit).isOk()).toBe(true);
  expect(
    inspect(
      editWebm(bytes, (node, payload) =>
        node.id === ebmlId.duration ? null : payload,
      ),
    ),
  ).toMatchObject({ error: "DURATION_UNPROVABLE" });
  const badAudio = editWebm(bytes, (node, payload) => {
    if (node.id !== ebmlId.simpleBlock || payload[0] !== 0x82) return payload;
    const changed = payload.slice();
    const view = new DataView(changed.buffer);
    view.setInt16(1, Math.round(view.getInt16(1) / 2));
    return changed;
  });
  expect(inspectWebmPacketFile(badAudio).isError()).toBe(true);
});

test("known leaves obey their schema types even when they do not affect timing", async () => {
  const { editWebm } = await import("../fixtures/media/webm/modify");
  const bytes = await native();
  for (const [id, value] of [
    [ebmlId.trackUid, new Uint8Array()],
    [ebmlId.writingApp, Uint8Array.from([0xff])],
  ] as const) {
    expect(
      inspectWebmPacketFile(
        editWebm(bytes, (node, payload) => (node.id === id ? value : payload)),
      ).isError(),
    ).toBe(true);
  }
});

test("BlockGroup video duration and zero padding work; signed nonzero padding never trims evidence", async () => {
  const { withVideoGroup, element, uint } = await import(
    "../fixtures/media/webm/modify"
  );
  const bytes = await native();
  expect(
    inspectWebmPacketFile(
      withVideoGroup(bytes, [element(ebmlId.blockDuration, uint(50))]),
    ).isOk(),
  ).toBe(true);
  expect(
    inspectWebmPacketFile(
      withVideoGroup(bytes, [element(ebmlId.discardPadding, uint(0))]),
    ).isOk(),
  ).toBe(true);
  for (const padding of [Uint8Array.from([1]), Uint8Array.from([255])]) {
    expect(
      inspect(withVideoGroup(bytes, [element(ebmlId.discardPadding, padding)])),
    ).toMatchObject({ error: "UNSUPPORTED_MEDIA" });
  }
});
test("Cues must target real clusters and EBML element/packet budgets are aggregate", async () => {
  const { element, editWebm } = await import("../fixtures/media/webm/modify");
  const indexed = await native("msedge-vp8");
  const segment = one(parseWebm(indexed), ebmlId.segment);
  const cue = one(
    one(one(segment.children, ebmlId.cues).children, ebmlId.cue).children,
    ebmlId.cuePosition,
  );
  const cluster = one(cue.children, ebmlId.cueCluster);
  indexed[cluster.end - 1] = (indexed[cluster.end - 1] ?? 0) ^ 1;
  expect(inspectWebmPacketFile(indexed).isError()).toBe(true);
  const voids = new Uint8Array(
    Buffer.concat(
      Array.from({ length: 12001 }, () =>
        element(ebmlId.void, new Uint8Array()),
      ),
    ),
  );
  expect(() => parseWebm(voids)).toThrow("budget");
  const bytes = await native();
  const original = one(parseWebm(bytes), ebmlId.segment);
  const first = one(original.children, ebmlId.cluster);
  const audio = first.children.find(
    (node) => node.id === ebmlId.simpleBlock && bytes[node.data] === 0x82,
  );
  if (!audio) throw Error("fixture audio");
  const repeated = element(audio.id, bytes.subarray(audio.data, audio.end));
  const packets = editWebm(bytes, (node, payload) =>
    node.id === ebmlId.cluster
      ? new Uint8Array(
          Buffer.concat([payload, ...Array<Uint8Array>(8193).fill(repeated)]),
        )
      : payload,
  );
  expect(() => inspectWebm(packets)).toThrow("budget");
});
