/** Владеет поколением и AbortController запроса; отмена инвалидирует поздние результаты, а dispose запрещает новый begin. */
export const createRequestLifetime = () => {
  const owner = {
    disposed: false,
    generation: 0,
    controller: new AbortController(),
  };
  /** Инвалидирует поколение и сигнализирует отмену текущего запроса, не обещая завершения внешнего I/O. */
  const release = () => {
    owner.generation++;
    owner.controller.abort();
  };
  return {
    release,
    /** Отменяет прежний запрос и выдаёт новый signal с проверкой поколения; после dispose возвращает null. */
    begin: () => {
      if (owner.disposed) return null;
      release();
      const generation = owner.generation;
      const controller = new AbortController();
      owner.controller = controller;
      return {
        signal: controller.signal,
        /** Разрешает принять результат только живому владельцу того же поколения запроса. */
        isCurrent: () => !owner.disposed && generation === owner.generation,
      };
    },
    /** Закрывает владельца навсегда и сигнализирует отмену текущего запроса. */
    dispose: () => {
      owner.disposed = true;
      release();
    },
  };
};
