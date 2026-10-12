import { expect, test } from "bun:test";
import { revealAfterPaint } from "../../../apps/fe-insta/src/app/shell/browser/components/HydrationReveal/lib/reveal-after-paint";

test("server template loads the critical reveal stylesheet before client bootstrap", async () => {
  const template = await Bun.file(
    new URL("../../../apps/fe-insta/src/app.html", import.meta.url),
  ).text();
  const stylesheet = template.match(
    /<link rel="stylesheet" href="%sveltekit.assets%([^"]+)"\s*\/>/,
  );
  if (!stylesheet?.[1] || stylesheet.index === undefined)
    throw new Error("Missing critical server stylesheet");
  expect(stylesheet.index).toBeLessThan(template.indexOf("%sveltekit.head%"));
  const asset = Bun.file(
    new URL(`../../../apps/fe-insta/static${stylesheet[1]}`, import.meta.url),
  );
  expect(await asset.exists()).toBe(true);
  const css = await asset.text();
  expect(css).toContain("@media (scripting: none)");
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
});

const createFrames = () => {
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  return {
    frames,
    requestFrame: (callback: FrameRequestCallback) => {
      sequence += 1;
      frames.set(sequence, callback);
      return sequence;
    },
    cancelFrame: (frame: number) => {
      frames.delete(frame);
    },
    paint: () => {
      const next = frames.entries().next().value;
      if (!next) throw new Error("No scheduled rendering frame");
      const [frame, callback] = next;
      frames.delete(frame);
      callback(0);
    },
  };
};

test("keeps the cover until a rendering frame follows hydration", () => {
  const frames = createFrames();
  let reveals = 0;
  const close = revealAfterPaint({
    ...frames,
    reveal: () => {
      reveals += 1;
    },
  });
  expect(reveals).toBe(0);
  frames.paint();
  expect(reveals).toBe(0);
  frames.paint();
  expect(reveals).toBe(1);
  expect(frames.frames.size).toBe(0);
  close();
});

test.each(["before first paint", "between paints"])(
  "unmount %s cancels owned work",
  (phase) => {
    const frames = createFrames();
    let reveals = 0;
    const close = revealAfterPaint({
      ...frames,
      reveal: () => {
        reveals += 1;
      },
    });
    if (phase === "between paints") frames.paint();
    const queued = [...frames.frames.values()];
    close();
    expect(frames.frames.size).toBe(0);
    for (const callback of queued) callback(0);
    expect(reveals).toBe(0);
    expect(frames.frames.size).toBe(0);
  },
);
