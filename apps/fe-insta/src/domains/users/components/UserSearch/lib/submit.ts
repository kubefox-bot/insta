import type { Writable } from "svelte/store";
import type { SearchDependencies, SearchOwner, SearchView } from "../types";

/**
 * Запускает один поиск по непустому запросу, владеет AbortController и применяет результат
 * только для текущего поколения; в finally освобождает свою pending-ссылку.
 */
export const submitSearch = async ({
  owner,
  view,
  search,
  onResults,
}: SearchDependencies &
  Readonly<{ owner: SearchOwner; view: Writable<SearchView> }>) => {
  const q = owner.q.trim();
  if (owner.disposed || !q || owner.pending) return;
  const request = new AbortController();
  const generation = owner.generation;
  owner.pending = request;
  view.set({ q: owner.q, status: "loading" });
  /**
   * Разрешает результат только живому контроллеру с тем же поколением и неотменённым запросом.
   */
  const isCurrent = () =>
    !owner.disposed &&
    !request.signal.aborted &&
    owner.generation === generation;
  try {
    const items = await search({ q, signal: request.signal });
    if (!isCurrent()) return;
    view.set({ q: owner.q, status: "ready", items });
    if (isCurrent()) onResults?.(items);
  } catch {
    if (isCurrent()) view.set({ q: owner.q, status: "error" });
  } finally {
    if (owner.pending === request) owner.pending = undefined;
  }
};
