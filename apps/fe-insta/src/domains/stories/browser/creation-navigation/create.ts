import type { CreationNavigationDependencies } from "./types";

/** Выбирает только допустимый локальный host-маршрут; auth и creation URL не считаются выходом, при несовпадении используется маршрут по состоянию входа. */
export const createCreationNavigation = ({
  navigate,
  returnTarget,
  authenticated,
}: CreationNavigationDependencies) => {
  const fallback = authenticated ? "/conversations" : "/";
  const destination =
    returnTarget &&
    /^(?:\/|\/conversations(?:\/[a-zA-Z0-9-]+)?)$/.test(returnTarget)
      ? returnTarget
      : fallback;
  return {
    /** Выполняет переход к заранее выбранному безопасному маршруту выхода. */
    finish: () => navigate(destination),
  };
};
