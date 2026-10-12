/** Запрашивает обновление при начальной видимости и возвращении вкладки; возвращённая функция снимает слушатель. */
export const observeFeedVisibility = ({
  visibility,
  request,
}: Readonly<{
  visibility: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >;
  request: () => void;
}>) => {
  const state = { visible: visibility.visibilityState === "visible" };
  /** Отслеживает переход из скрытого состояния в видимое и только тогда запрашивает обновление. */
  const changed = () => {
    const visible = visibility.visibilityState === "visible";
    if (visible && !state.visible) request();
    state.visible = visible;
  };
  visibility.addEventListener("visibilitychange", changed);
  if (state.visible) request();
  return () => visibility.removeEventListener("visibilitychange", changed);
};
