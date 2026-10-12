import { expect, test } from "bun:test";
import { createGrowthMeasurement } from "../lib/measurement";

const setup = () => {
  let width = 320;
  let typography = "font-size:16px;line-height:24px";
  const sizes: string[] = [];
  const measurement = createGrowthMeasurement({
    read: () => ({ width, typography }),
    resize: () => {
      sizes.push(typography);
    },
  });
  return {
    measurement,
    sizes,
    font: (value: string) => {
      typography = value;
    },
    width: (value: number) => {
      width = value;
    },
  };
};

test("existing draft is remeasured when font metrics change at exactly the same width", () => {
  const { measurement, sizes, font } = setup();
  measurement.refresh();
  expect(sizes).toEqual(["font-size:16px;line-height:24px"]);
  font("font-size:32px;line-height:48px");
  measurement.check();
  expect(sizes).toEqual([
    "font-size:16px;line-height:24px",
    "font-size:32px;line-height:48px",
  ]);
});

test("observer notifications from our own height writes do not cause another measurement", () => {
  const { measurement, sizes } = setup();
  measurement.refresh();
  measurement.check();
  measurement.check();
  expect(sizes).toHaveLength(1);
});

test("width changes remeasure wrapping and unchanged width does not", () => {
  const { measurement, sizes, width } = setup();
  measurement.refresh();
  width(240);
  measurement.check();
  measurement.check();
  expect(sizes).toHaveLength(2);
});

test("text and font-load refreshes remeasure even when computed metrics are identical", () => {
  const { measurement, sizes } = setup();
  measurement.refresh();
  measurement.refresh();
  expect(sizes).toHaveLength(2);
});

test("dispose makes queued observer and text refresh callbacks inert", () => {
  const { measurement, sizes, font } = setup();
  measurement.refresh();
  measurement.dispose();
  font("font-size:32px;line-height:48px");
  measurement.check();
  measurement.refresh();
  expect(sizes).toHaveLength(1);
});
