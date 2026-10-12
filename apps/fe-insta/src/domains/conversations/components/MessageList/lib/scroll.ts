import type { ScrollSnapshot } from "../../../browser/scroll/types";

/** Сохраняет scrollTop и первый ряд ниже верхней границы как визуальный якорь, вместе с признаками низа и новых сообщений. */
export const captureScroll = ({
  viewport,
  nearBottom,
  unread,
}: Readonly<{
  viewport: HTMLDivElement;
  nearBottom: boolean;
  unread: boolean;
}>): ScrollSnapshot => {
  const top = viewport.getBoundingClientRect().top;
  const anchor = [
    ...viewport.querySelectorAll<HTMLElement>("[data-message-id]"),
  ].find((element) => element.getBoundingClientRect().bottom > top);
  const id = anchor?.dataset.messageId;
  return {
    topPx: viewport.scrollTop,
    nearBottom,
    unread,
    anchor:
      anchor && id
        ? { id, offsetPx: anchor.getBoundingClientRect().top - top }
        : null,
  };
};

/** Восстанавливает низ либо смещение найденного якоря; если ряд уже отсутствует, использует сохранённый scrollTop. */
export const restoreScroll = ({
  viewport,
  snapshot,
}: Readonly<{ viewport: HTMLDivElement; snapshot: ScrollSnapshot }>) => {
  if (snapshot.nearBottom) {
    viewport.scrollTop = viewport.scrollHeight;
    return;
  }
  const anchor = [
    ...viewport.querySelectorAll<HTMLElement>("[data-message-id]"),
  ].find((element) => element.dataset.messageId === snapshot.anchor?.id);
  if (anchor && snapshot.anchor) {
    viewport.scrollTop +=
      anchor.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top -
      snapshot.anchor.offsetPx;
    return;
  }
  viewport.scrollTop = snapshot.topPx;
};
