import { createCreationNavigation } from "../creation-navigation/create";
import type { CreationFocusTarget, CreationSessionDependencies } from "./types";

/** Владеет сохранённым host-маршрутом и порядком navigation/render/focus; выбор продолжения авторизации остаётся снаружи. */
export const createCreationSession = ({
  authenticated,
  navigate,
  replace,
  settled,
  recorder,
}: CreationSessionDependencies) => {
  let host: Readonly<{
    path: string;
    trigger: CreationFocusTarget | null;
  }> | null = null;
  let navigating = false;
  /** Забывает сохранённый host и отмечает полный переход до завершения navigate, включая ошибку. */
  const leave = async (target: string | URL) => {
    host = null;
    navigating = true;
    try {
      await navigate(target);
    } finally {
      navigating = false;
    }
  };
  /** Захватывает host и готовит безопасное возвращение с восстановлением фокуса после завершения рендера. */
  const prepareReturn = () => {
    const retained = host;
    const navigation = createCreationNavigation({
      authenticated: authenticated(),
      returnTarget: retained?.path,
      /** Возвращает сохранённый host через replace и settled с фокусом на живом trigger; иначе выполняет полный переход. */
      navigate: async (target) => {
        host = null;
        if (retained && target === retained.path) {
          replace(target, {});
          await settled();
          if (retained.trigger?.isConnected)
            retained.trigger.focus({ preventScroll: true });
          return;
        }
        await leave(target);
      },
    });
    return navigation.finish;
  };
  /** Выполняет подготовленное возвращение к host без самостоятельного закрытия recorder. */
  const returnToHost = () => prepareReturn()();
  return {
    /** Сохраняет маршрут и trigger текущего host для последующего возвращения. */
    retain: (
      retained: Readonly<{ path: string; trigger: CreationFocusTarget | null }>,
    ) => {
      host = retained;
    },
    /** Забывает host без навигации и без освобождения recorder. */
    clear: () => {
      host = null;
    },
    /** Сообщает, сохранён ли host для открытия поверх текущего маршрута. */
    hasHost: () => host !== null,
    /** Сообщает о выполняющемся полном переходе, чтобы различать его с локальным replace. */
    isNavigating: () => navigating,
    leave,
    returnToHost,
    /** При сохранённом host открывает recorder через replace состояния маршрута; иначе выполняет navigate. */
    open: async (target: string) => {
      if (host) {
        replace(target, { storyCreation: true });
        await recorder.open();
        return;
      }
      await navigate(target);
    },
    /** Захватывает маршрут возврата, дожидается закрытия recorder и затем возвращает host и фокус. */
    finish: async () => {
      const finish = prepareReturn();
      await recorder.close();
      await finish();
    },
  };
};
