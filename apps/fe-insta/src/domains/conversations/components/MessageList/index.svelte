<script lang="ts">
 import { Button } from "@insta/ui-kit";
 import { onDestroy, tick, untrack } from "svelte";
 import MessageBubble from "../MessageBubble/index.svelte";
 import { nearBottomPx } from "./conts";
 import { captureScroll, restoreScroll } from "./lib/scroll";
 import { observeMessageVisibility } from "./lib/visibility";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let { isForeground = true, items, actorId, copy, locale, unavailable = false, earlier, loading, loadEarlier, scroll:scrollBinding, readVisible }: Props = $props();
 const scrollMemory=untrack(()=>scrollBinding);
 let viewport: HTMLDivElement | undefined = $state();
 let nearBottom = $state(true);
 let unread = $state(false);
 let lastId: string | undefined;
 let initialized=false;
 let restoring=false;
 let disposed=false;
 /** Сохраняет позицию и индикатор новых сообщений в привязке диалога только после инициализации viewport. */
 const remember=()=>{if(viewport&&initialized)scrollMemory?.capture(captureScroll({viewport,nearBottom,unread}));};
 onDestroy(()=>{remember();disposed=true;});
 /** Прокручивает живой viewport к последнему сообщению, снимает индикатор новых и сохраняет позицию. */
 const bottom = () => { if (!viewport||disposed) return; viewport.scrollTop = viewport.scrollHeight; nearBottom=true; unread=false; remember(); };
 /** После пользовательской прокрутки пересчитывает близость к низу и сохраняет позицию; события восстановления игнорирует. */
 const scroll = () => { if (!viewport||restoring) return; nearBottom=viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight<=nearBottomPx; if(nearBottom)unread=false; remember(); };
 /** Восстанавливает привязанную позицию после обновления DOM; после уничтожения компонента DOM не трогает и не завершает инициализацию. */
 const restore=async(target:HTMLDivElement)=>{
  restoring=true;
  const snapshot=scrollMemory?.read();
  nearBottom=snapshot?.nearBottom??true;
  unread=snapshot?.unread??false;
  await tick();
  if(disposed)return;
  if(snapshot)restoreScroll({viewport:target,snapshot});else bottom();
  lastId=items.at(-1)?.id;initialized=true;restoring=false;remember();
 };
 $effect(()=>{
  const id=items.at(-1)?.id;
  const target=viewport;
  if(!target||restoring)return;
  if(!initialized){
   if(loading&&items.length===0)return;
   restore(target).catch(()=>{restoring=false;unread=true;});
   return;
  }
  if(id===lastId)return;
  lastId=id;
  if(nearBottom)tick().then(bottom).catch(()=>{unread=true;});else {unread=true;remember();}
 });
 $effect(()=>{items;if(!viewport||!readVisible||!isForeground)return;return observeMessageVisibility({viewport,actorId,onVisible:readVisible,
 /** Передаёт наблюдателю актуальный foreground-флаг, чтобы перекрытая история не подтверждала прочтение. */
 isForeground:()=>isForeground});});
 /** Сохраняет визуальный якорь перед загрузкой ранних сообщений и восстанавливает его после DOM tick, если viewport ещё принадлежит компоненту. */
 const older = async () => {
  const target=viewport;
  if(!target||disposed)return;
  const snapshot=captureScroll({viewport:target,nearBottom:false,unread});
  await loadEarlier();
  await tick();
  if(disposed||viewport!==target)return;
  restoreScroll({viewport:target,snapshot});
  remember();
 };
</script>
<div class={styles.history}>
<div class={styles.viewport} bind:this={viewport} onscroll={scroll} data-testid="message-list">
 {#if earlier}<Button variant="text" disabled={loading} onclick={()=>older().catch(()=>{})}>{copy.conversations.loadEarlier}</Button>{/if}
 {#if items.length === 0 && !loading && !unavailable}<p class={styles.empty}>{copy.conversations.noMessages}</p>{/if}
 <ol class={styles.messages}>
 {#each items as message (message.id)}<MessageBubble {message} {actorId} {copy} {locale} />{/each}
 </ol>
</div>
{#if unread}<Button variant="secondary" class={styles.unread} onclick={bottom}>{copy.conversations.newMessages}</Button>{/if}

</div>
