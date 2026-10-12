import type { GrowthMeasurement, GrowthMetrics } from "../types";

/** Запоминает метрики ширины и типографики, чтобы не запускать цикл resize без изменения входов; внешними observer владеет вызывающий action. */
export const createGrowthMeasurement = ({
  read,
  resize,
}: Readonly<{
  read: () => GrowthMetrics;
  resize: () => void;
}>): GrowthMeasurement => {
  let previous: GrowthMetrics | null = null;
  let disposed = false;
  /** Принудительно обновляет метрики и высоту, если владелец ещё жив. */
  const refresh = () => {
    if (disposed) return;
    previous = read();
    resize();
  };
  /** Пересчитывает высоту только при изменившейся ширине или типографике. */
  const check = () => {
    if (disposed) return;
    const current = read();
    if (
      previous?.width === current.width &&
      previous.typography === current.typography
    )
      return;
    previous = current;
    resize();
  };
  return {
    check,
    refresh,
    /** Блокирует поздние измерения и resize после уничтожения action. */
    dispose: () => {
      disposed = true;
    },
  };
};
