import { playbackObservation } from "../conts";
/** Наблюдает фактическое видимое проигрывание до принятия одной записи события; возвращённая функция снимает все слушатели. */
export const observeStoryPlaying = ({
  media,
  visibility,
  visible,
  record,
}: Readonly<{
  media: EventTarget &
    Readonly<{ paused: boolean; ended: boolean; readyState: number }>;
  visibility: EventTarget;
  visible: () => boolean;
  record: () => boolean;
}>) => {
  let recorded = false;
  let active = false;
  /** Пытается записать событие лишь для активного видимого видео с готовыми данными; отказ record допускает следующую попытку. */
  const observe = () => {
    if (
      !active ||
      recorded ||
      media.paused ||
      media.ended ||
      media.readyState < playbackObservation.readyState ||
      !visible()
    )
      return;
    recorded = record();
  };
  /** Отмечает начало фактического проигрывания и проверяет условия записи события. */
  const playing = () => {
    active = true;
    observe();
  };
  /** Снимает признак проигрывания при событиях остановки, не фиксируя просмотр. */
  const inactive = () => {
    active = false;
  };
  media.addEventListener("playing", playing);
  for (const event of playbackObservation.inactiveEvents)
    media.addEventListener(event, inactive);
  visibility.addEventListener("visibilitychange", observe);
  return () => {
    media.removeEventListener("playing", playing);
    for (const event of playbackObservation.inactiveEvents)
      media.removeEventListener(event, inactive);
    visibility.removeEventListener("visibilitychange", observe);
  };
};
