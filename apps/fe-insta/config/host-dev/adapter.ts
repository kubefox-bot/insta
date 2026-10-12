import type { Adapter } from "@sveltejs/kit";
import { getRequest } from "@sveltejs/kit/node";

/**
 * Дополняет адаптер фиксированным origin для host-dev SSR. При отсутствии настройки
 * сохраняет исходный адаптер; унаследованную Vite-конфигурацию не отбрасывает.
 */
export const withHostDevOrigin = ({
  adapter,
  origin,
}: {
  readonly adapter: Adapter;
  readonly origin: string | undefined;
}): Adapter => {
  if (origin === undefined) return adapter;
  const inherited = adapter.vite;
  return {
    ...adapter,
    /**
     * Применяет унаследованные настройки адаптера к текущему Vite-контексту и подменяет
     * только построение Request для локального origin.
     */
    vite: (context) => ({
      ...(typeof inherited === "function" ? inherited(context) : inherited),
      /**
       * Строит Kit Request с доверенным host-dev base, сохраняя остальные параметры
       * входящего запроса.
       */
      getRequest: (options) => getRequest({ ...options, base: origin }),
    }),
  };
};
