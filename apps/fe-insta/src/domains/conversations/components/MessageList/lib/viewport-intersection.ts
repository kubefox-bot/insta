/** Проверяет ненулевую площадь пересечения принадлежащего viewport ряда с его границами и окном; касание края не считается видимостью. */
export const hasViewportIntersection = ({
  row,
  viewport,
  window,
}: Readonly<{
  row: HTMLElement;
  viewport: HTMLElement;
  window: Window;
}>) => {
  if (!viewport.contains(row)) return false;
  const root = viewport.getBoundingClientRect();
  const bounds = row.getBoundingClientRect();
  return (
    Math.min(bounds.right, root.right, window.innerWidth) >
      Math.max(bounds.left, root.left, 0) &&
    Math.min(bounds.bottom, root.bottom, window.innerHeight) >
      Math.max(bounds.top, root.top, 0)
  );
};
