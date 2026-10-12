export const element = (id: readonly number[], data: readonly number[]) => {
  if (data.length >= 127) throw new Error("small fixture only");
  return [...id, 0x80 + data.length, ...data];
};
export const float = (value: number, size: 4 | 8 = 8) => {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  if (size === 4) view.setFloat32(0, value);
  else view.setFloat64(0, value);
  return [...bytes];
};
export const fixture = (
  options: Readonly<{
    duration?: number;
    durationSize?: 4 | 8;
    indexed?: boolean;
    voidSize?: number;
    scale?: readonly number[];
    finite?: boolean;
  }> = {},
) => {
  const scale = element(
    [0x2a, 0xd7, 0xb1],
    options.scale ?? [0x0f, 0x42, 0x40],
  );
  const infoPayload = [
    ...scale,
    ...element([0x4d, 0x80], [0x61, 0x62]),
    ...(options.duration === undefined
      ? []
      : element([0x44, 0x89], float(options.duration, options.durationSize))),
    ...(options.voidSize === undefined
      ? []
      : element([0xec], Array(options.voidSize - 2).fill(0))),
  ];
  const info = element([0x15, 0x49, 0xa9, 0x66], infoPayload);
  const indices = options.indexed ? element([0x11, 0x4d, 0x9b, 0x74], []) : [];
  const tracks = element(
    [0x16, 0x54, 0xae, 0x6b],
    element([0xae], element([0x63, 0xa2], [1, 2, 3, 4, 5])),
  );
  const clusters = [
    0x1f,
    0x43,
    0xb6,
    0x75,
    0xff,
    ...element([0xe7], [0]),
    ...element([0xa3], [0x81, 0, 0, 0x80, 0x15, 0x49, 0xa9, 0x66]),
    0x1f,
    0x43,
    0xb6,
    0x75,
    0xff,
    ...element([0xe7], [1]),
    ...element([0xa3], [0x81, 0, 1, 0x80, 8, 9]),
  ];
  const tail = [...indices, ...tracks, ...clusters];
  const segment = [...info, ...tail];
  const bytes = new Uint8Array([
    0x1a,
    0x45,
    0xdf,
    0xa3,
    0x80,
    0x18,
    0x53,
    0x80,
    0x67,
    options.finite ? 0x80 + segment.length : 0xff,
    ...segment,
  ]);
  return {
    bytes,
    tail: new Uint8Array(tail),
    blob: new Blob([bytes], { type: "video/webm;codecs=vp8,opus" }),
  };
};
