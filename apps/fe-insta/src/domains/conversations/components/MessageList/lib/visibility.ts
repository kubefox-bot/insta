import { hasViewportIntersection } from "./viewport-intersection";

/** Наблюдает входящие ряды и сообщает реально пересекающиеся с viewport ID только при фокусе, видимости и foreground. Возвращённая очистка освобождает observer и слушатели; без IntersectionObserver наблюдение не запускается. */
export const observeMessageVisibility = ({
  viewport,
  actorId,
  onVisible,
  isForeground,
}: Readonly<{
  isForeground: () => boolean;
  viewport: HTMLElement;
  actorId: string;
  onVisible: (messageIds: readonly string[]) => void;
}>) => {
  const document = viewport.ownerDocument;
  const window = document.defaultView;
  if (!window || typeof IntersectionObserver === "undefined") return () => {};
  const rows = [
    ...viewport.querySelectorAll<HTMLElement>(
      "[data-message-id][data-author-id]",
    ),
  ].filter((row) => row.dataset.authorId !== actorId);
  /** Проверяет foreground сценария, видимость документа и фокус перед подтверждением прочтения. */
  const active = () =>
    isForeground() &&
    document.visibilityState === "visible" &&
    document.hasFocus();
  /** Повторно проверяет геометрию рядов и передаёт только непустой набор видимых message ID. */
  const emit = (elements: readonly HTMLElement[]) => {
    if (!active()) return;
    const ids = elements
      .filter((row) => hasViewportIntersection({ row, viewport, window }))
      .flatMap((row) => (row.dataset.messageId ? [row.dataset.messageId] : []));
    if (ids.length) onVisible(ids);
  };
  const observer = new IntersectionObserver((entries) => {
    const elements = entries
      .filter(
        (entry) =>
          entry.isIntersecting &&
          entry.intersectionRect.width > 0 &&
          entry.intersectionRect.height > 0,
      )
      .map((entry) => entry.target)
      .filter((target): target is HTMLElement => target instanceof HTMLElement);
    emit(elements);
  });
  for (const row of rows) observer.observe(row);
  // Re-observation obtains fresh implicit-root intersections, including clipping
  // ancestors and the browser viewport, when focus/visibility return unchanged.
  /** Перезапускает наблюдение при активной странице, чтобы получить свежие пересечения с учётом clipping ancestors. */
  const recheck = () => {
    if (!active()) return;
    observer.disconnect();
    observer.takeRecords();
    for (const row of rows) observer.observe(row);
  };
  // Threshold 0 can report an intersecting zero-area edge without another
  // callback when pixels enter. Owned/ancestor scroll obtains fresh entries.
  /** Обновляет наблюдение после прокрутки документа либо предка viewport, включая переход от касания края к ненулевой площади. */
  const recheckScroll = (event: Event) => {
    const target = event.target;
    if (
      target === document ||
      (target instanceof Element && target.contains(viewport))
    )
      recheck();
  };
  window.addEventListener("focus", recheck);
  document.addEventListener("visibilitychange", recheck);
  document.addEventListener("scroll", recheckScroll, true);
  return () => {
    observer.disconnect();
    window.removeEventListener("focus", recheck);
    document.removeEventListener("visibilitychange", recheck);
    document.removeEventListener("scroll", recheckScroll, true);
  };
};
