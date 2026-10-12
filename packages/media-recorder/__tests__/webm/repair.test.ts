import { expect, test } from "bun:test";
import * as webm from "../../src/webm/index";
import { value } from "../fixtures/outcome";
import { fixture, float } from "./fixture";

test("public WebM repair operation is available separately from recorder", () => {
  expect(typeof webm.repairWebmDuration).toBe("function");
});

test.each([4, 8] as const)(
  "positive Float%d metadata preserves exact Blob identity",
  async (durationSize) => {
    const source = fixture({ duration: 900, durationSize, indexed: true });
    expect(
      value(
        await webm.repairWebmDuration({
          maxBytes: 1_048_576,
          blob: source.blob,
          elapsedMs: 2000,
        }),
      ),
    ).toBe(source.blob);
  },
);

test.each([undefined, 0])(
  "repairs streaming duration %s and preserves every byte outside metadata",
  async (duration) => {
    const source = fixture({ duration });
    const repaired = value(
      await webm.repairWebmDuration({
        maxBytes: 1_048_576,
        blob: source.blob,
        elapsedMs: 1234.5,
      }),
    );
    const bytes = new Uint8Array(await repaired.arrayBuffer());
    expect(repaired.type).toBe(source.blob.type);
    expect(bytes.slice(0, 10)).toEqual(source.bytes.slice(0, 10));
    expect(bytes.slice(-source.tail.length)).toEqual(source.tail);
    expect([...bytes]).toContain(0x89);
    expect(
      Buffer.from(bytes).includes(
        Buffer.from([0x44, 0x89, 0x88, ...float(1234.5)]),
      ),
    ).toBe(true);
    expect(
      value(
        await webm.repairWebmDuration({
          maxBytes: 1_048_576,
          blob: repaired,
          elapsedMs: 9,
        }),
      ),
    ).toBe(repaired);
  },
);

test.each([7, 8, 9, 11, 12, 13, 20])(
  "indexed Void slot of %d bytes keeps size and offsets",
  async (voidSize) => {
    const source = fixture({ indexed: true, voidSize, finite: true });
    const repaired = value(
      await webm.repairWebmDuration({
        maxBytes: 1_048_576,
        blob: source.blob,
        elapsedMs: 1234.5,
      }),
    );
    const bytes = new Uint8Array(await repaired.arrayBuffer());
    expect(bytes.length).toBe(source.bytes.length);
    expect(repaired).not.toBe(source.blob);
    expect(
      Buffer.from(bytes).includes(
        Buffer.from(float(1234.5, voidSize < 11 ? 4 : 8)),
      ),
    ).toBe(true);
    expect(bytes.slice(0, 27)).toEqual(source.bytes.slice(0, 27));
    expect(bytes.slice(-source.tail.length)).toEqual(source.tail);
    expect(
      value(
        await webm.repairWebmDuration({
          maxBytes: 1_048_576,
          blob: repaired,
          elapsedMs: 1,
        }),
      ),
    ).toBe(repaired);
  },
);

test.each([4, 8] as const)(
  "zero indexed Float%d is replaced in place",
  async (durationSize) => {
    const source = fixture({ indexed: true, duration: 0, durationSize });
    const repaired = value(
      await webm.repairWebmDuration({
        maxBytes: 1_048_576,
        blob: source.blob,
        elapsedMs: 1000,
      }),
    );
    expect(repaired.size).toBe(source.blob.size);
    expect(
      Buffer.from(await repaired.arrayBuffer()).includes(
        Buffer.from(float(1000, durationSize)),
      ),
    ).toBe(true);
    expect(
      new Uint8Array(await repaired.arrayBuffer()).slice(-source.tail.length),
    ).toEqual(source.tail);
  },
);

test("indexed growth and finite Segment growth are unsupported", async () => {
  for (const options of [
    { indexed: true },
    { finite: true },
    { indexed: true, voidSize: 6 },
  ]) {
    const source = fixture(options);
    expect(
      (
        await webm.repairWebmDuration({
          maxBytes: 1_048_576,
          blob: source.blob,
          elapsedMs: 1000,
        })
      ).isError(),
    ).toBe(true);
  }
});

test("invalid duration, elapsed and non-native scale fail closed", async () => {
  for (const duration of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(
      (
        await webm.repairWebmDuration({
          maxBytes: 1_048_576,
          blob: fixture({ duration }).blob,
          elapsedMs: 1,
        })
      ).isError(),
    ).toBe(true);
  }
  for (const elapsedMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(
      (
        await webm.repairWebmDuration({
          maxBytes: 1_048_576,
          blob: fixture().blob,
          elapsedMs,
        })
      ).isError(),
    ).toBe(true);
  }
  expect(
    (
      await webm.repairWebmDuration({
        maxBytes: 1_048_576,
        blob: fixture({ scale: [1] }).blob,
        elapsedMs: 1,
      })
    ).isError(),
  ).toBe(true);
});

test("truncation, overflowing sizes and trailing garbage fail closed", async () => {
  const { bytes } = fixture();
  const oversizedInfo = bytes.slice();
  oversizedInfo[14] = 0xfe;
  const zeroSizeMarker = bytes.slice();
  zeroSizeMarker[14] = 0;
  const unknownInfo = bytes.slice();
  unknownInfo[14] = 0xff;
  for (const malformed of [
    bytes.slice(0, -1),
    oversizedInfo,
    zeroSizeMarker,
    unknownInfo,
    new Uint8Array([...bytes, 0]),
  ]) {
    expect(
      (
        await webm.repairWebmDuration({
          maxBytes: 1_048_576,
          blob: new Blob([malformed]),
          elapsedMs: 1000,
        })
      ).isError(),
    ).toBe(true);
  }
});

test("consumer byte cap rejects input before allocating its array buffer", async () => {
  class UnreadableBlob extends Blob {
    override async arrayBuffer(): Promise<ArrayBuffer> {
      throw new Error("must not be read");
    }
  }
  const blob = new UnreadableBlob([fixture().bytes]);
  const result = await webm.repairWebmDuration({
    blob,
    elapsedMs: 1000,
    maxBytes: 1,
  });
  expect(result.isError() ? result.getError().code : "ok").toBe(
    "invalid-input",
  );
});

test("unindexed Cluster Position forbids growth that would invalidate offsets", async () => {
  const source = fixture();
  const clusterStart = source.bytes.indexOf(0x1f, 10);
  const bytes = new Uint8Array([
    ...source.bytes.slice(0, clusterStart + 5),
    0xa7,
    0x81,
    0,
    ...source.bytes.slice(clusterStart + 5),
  ]);
  expect(
    (
      await webm.repairWebmDuration({
        maxBytes: 1_048_576,
        blob: new Blob([bytes]),
        elapsedMs: 1000,
      })
    ).isError(),
  ).toBe(true);
});

test.each([
  { voidSize: 109, infoSizeWidth: 1, infoBytes: 126 },
  { voidSize: 110, infoSizeWidth: 1, infoBytes: 127 },
  { voidSize: 111, infoSizeWidth: 1, infoBytes: 128 },
  { voidSize: 114, infoSizeWidth: 1, infoBytes: 131 },
  { voidSize: 109, infoSizeWidth: 2, infoBytes: 127 },
  { voidSize: 110, infoSizeWidth: 2, infoBytes: 128 },
  { voidSize: 114, infoSizeWidth: 2, infoBytes: 132 },
])(
  "isolated provider Info of $infoBytes bytes preserves fitting indexed Void",
  async ({ voidSize, infoSizeWidth, infoBytes }) => {
    const source = fixture({ indexed: true, voidSize });
    // Widen the original Info size field independently of production encoding.
    // Its payload is 12 fixed metadata bytes plus the requested Void slot.
    const bytes =
      infoSizeWidth === 1
        ? source.bytes
        : new Uint8Array([
            ...source.bytes.slice(0, 14),
            0x40,
            12 + voidSize,
            ...source.bytes.slice(15),
          ]);
    const blob = new Blob([bytes], { type: source.blob.type });
    expect(bytes.length - source.tail.length - 10).toBe(infoBytes);
    const repaired = value(
      await webm.repairWebmDuration({
        blob,
        elapsedMs: 1234.5,
        maxBytes: 1_048_576,
      }),
    );
    const output = new Uint8Array(await repaired.arrayBuffer());
    const voidStart = 14 + infoSizeWidth + 12;
    expect(repaired.size).toBe(blob.size);
    expect(output.slice(0, voidStart)).toEqual(bytes.slice(0, voidStart));
    expect(output.slice(voidStart, voidStart + 11)).toEqual(
      new Uint8Array([0x44, 0x89, 0x88, ...float(1234.5)]),
    );
    expect(output.slice(-source.tail.length)).toEqual(source.tail);
    expect(
      value(
        await webm.repairWebmDuration({
          blob: repaired,
          elapsedMs: 9,
          maxBytes: 1_048_576,
        }),
      ),
    ).toBe(repaired);
  },
);
