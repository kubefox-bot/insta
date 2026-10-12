<script lang="ts">
  import { directoryQueryLimits } from "@insta/contracts/directory";
  import { ClearIcon, ClockIcon, SearchIcon } from "@insta/fe-core/ui/icons";
  import { Button, Input } from "@insta/ui-kit";
  import { onDestroy } from "svelte";
  import UserSearchResults from "../UserSearchResults/index.svelte";
  import { createSearchController } from "./lib/search-controller";
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  let { copy, search, open, onResults }: Props = $props();
  const controller = createSearchController({
 /**
  * Вызывает актуальный search из props для контроллера, сохраняя переданный сигнал отмены.
  */
  search: (input) => search(input),
 /**
  * Передаёт подтверждённые контроллером результаты текущему необязательному обработчику
  * компонента.
  */
  onResults: (items) => onResults?.(items) });
  const view = controller.view;
  const selection = { revision: 0, disposed: false };
  let field = $state<HTMLDivElement | undefined>(undefined);
  let opening = $state(false);
  let openingFailed = $state(false);
  /**
   * Инвалидирует ошибки прежнего выбора, сбрасывает ошибку открытия и передаёт строку
   * контроллеру поиска.
   */
  const edit = (q: string) => {
    selection.revision += 1;
    openingFailed = false;
    controller.edit(q);
  };
  /**
   * Очищает запрос и возвращает клавиатурный фокус полю поиска.
   */
  const clear = () => {
    edit("");
    field?.querySelector("input")?.focus();
  };
  /**
   * Открывает выбранного адресата без параллельного запуска; ошибку показывает только для
   * живого и неизменённого выбора, а busy снимает после завершения.
   */
  const select = async (recipientId: string) => {
    if (opening) return;
    const revision = selection.revision;
    opening = true;
    openingFailed = false;
    try { await open(recipientId); }
    catch { if (!selection.disposed && revision === selection.revision) openingFailed = true; }
    finally { opening = false; }
  };
  onDestroy(() => { selection.disposed = true; controller.dispose(); });
</script>

<section class={styles.search} aria-label={copy.conversations.searchUsers} data-testid="user-search">
  <form class={styles.row} onsubmit={async (event) => { event.preventDefault(); await controller.submit(); }}>
    <div class={styles.field} bind:this={field}>
      <Input label={copy.conversations.searchUsers} type="search" value={$view.q} oninput={(event: Event & { currentTarget: HTMLInputElement }) => edit(event.currentTarget.value)} placeholder={copy.conversations.searchPlaceholder} maxlength={directoryQueryLimits.max} class={styles.input} autocomplete="off" />
      <Button class={styles.clear} variant="text" disabled={!$view.q} aria-label={copy.conversations.clearSearch} onclick={clear}><ClearIcon /></Button>
    </div>
    <Button type="submit" class={styles.submit} variant="secondary" loading={$view.status === "loading"} disabled={!$view.q.trim()} aria-label={copy.conversations.search}>
      {#if $view.status === "loading"}<ClockIcon />{:else}<SearchIcon />{/if}
    </Button>
  </form>
  <UserSearchResults {copy} view={$view} {opening} {openingFailed} {select} retry={controller.submit} />
</section>
