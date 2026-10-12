/** Создаёт владельца освобождения tracks: каждый объект track останавливается не более одного раза за жизнь возвращённой функции. */
export const createTrackRelease = () => {
  const released = new WeakSet<MediaStreamTrack>();
  return (stream: MediaStream) => {
    for (const track of stream.getTracks()) {
      if (released.has(track)) continue;
      released.add(track);
      track.stop();
    }
  };
};
