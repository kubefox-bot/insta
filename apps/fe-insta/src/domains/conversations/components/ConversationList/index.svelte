<script lang="ts">
 import { formatRelativeDateTime } from "@insta/fe-core/dates";
 import { onMount } from "svelte";
 import { resolveRecipientUsername } from "../../browser/lib/recipient-username";
 import ConversationRow from "../ConversationRow/index.svelte";
 import { clockMinuteMs } from "./conts";
 import type { Props } from "./props";
 import styles from "./styles.module.css";
 import type { BrowserClock } from "./types";

 let { conversations, selectedId, actorId, usernames, copy, locale }: Props = $props();
 // Both SSR and initial hydration reserve an empty line; browser locale time starts after mount.
 let clock = $state<BrowserClock | null>(null);
 onMount(() => {
  /** Обновляет browser-время и часовой пояс после mount для относительных дат; SSR остаётся без локального времени. */
  const refresh = () => {
   clock = { nowMs: Date.now(), timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone };
  };
  /** Освежает даты и планирует следующий тик на границу минуты; таймер освобождается cleanup владельца onMount. */
  const tick = () => {
   refresh();
   timer = setTimeout(tick, clockMinuteMs - Date.now() % clockMinuteMs);
  };
  refresh();
  let timer = setTimeout(tick, clockMinuteMs - Date.now() % clockMinuteMs);
  document.addEventListener("visibilitychange", refresh);
  return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", refresh); };
 });
</script>
<nav aria-label={copy.navigation.conversations} class={styles.list}>
 {#if conversations.length === 0}<p>{copy.conversations.empty}</p>{/if}
 {#each conversations as conversation (conversation.id)}
  {@const username=resolveRecipientUsername({conversation,actorId,usernames})}
  {@const activity=clock?formatRelativeDateTime({timestampMs:conversation.lastActivityAt,nowMs:clock.nowMs,timeZone:clock.timeZone,locale}):null}
  <ConversationRow {activity} {conversation} selected={selectedId===conversation.id} {actorId} {username} {copy} />
 {/each}
</nav>
