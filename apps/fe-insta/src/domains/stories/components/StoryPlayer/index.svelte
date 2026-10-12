<script lang="ts">
 import { BackIcon } from "@insta/fe-core/ui/icons";
 import { Button,Dialog } from "@insta/ui-kit";
 import { onDestroy,untrack } from "svelte";
 import { createContactOperation } from "./contact/create";
 import { observeStoryHorizon } from "./lib/observe-horizon";
 import { observeStoryPlaying } from "./lib/observe-playing";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {player,copy,requestConversation,returnFocus,onPlayback}:Props=$props();
 const view=$derived(player.view);
 let playBlocked=$state(false);
 let mediaFailed=$state(false);
 let progress=$state(0);
 /** Запрещает ручной запуск видео до подключения актуального медиаресурса. */
 let playbackActive:()=>boolean=()=>false;
 let video=$state<HTMLVideoElement|undefined>(undefined);
 const contact=untrack(()=>createContactOperation({selection:player.view,requestConversation,close:player.close}));
 const conversation=contact.view;
 onDestroy(contact.dispose);
 /** Подключает наблюдение видимости и серверного горизонта выбранного видео; destroy освобождает слушатели и src, поздние play-результаты проверяют выбор. */
 const attachVideo=(element:HTMLVideoElement)=>{
  const selected=$view;
  if(selected.kind!=="ready")return {
  /** Не выполняет очистку, когда видео подключено вне готового выбора и ресурсы не приобретались. */
  destroy:()=>{}};
  let active=true;playBlocked=false;mediaFailed=false;progress=0;
  /** Проверяет активность элемента и совпадение Story и URL с захваченным выбором. */
  const isCurrent=()=>active&&$view.kind==="ready"&&$view.story.id===selected.story.id&&$view.playback.url===selected.playback.url;
  playbackActive=isCurrent;
  const releaseObservation=observeStoryPlaying({media:element,visibility:document,
  /** Разрешает наблюдение просмотра только актуальному, подключённому и видимому элементу в видимой вкладке. */
  visible:()=>isCurrent()&&document.visibilityState==="visible"&&element.isConnected&&element.getClientRects().length>0,
  /** Передаёт событие воспроизведения внешнему владельцу и сообщает, было ли оно принято. */
  record:()=>onPlayback?.()??false});
  const horizon=observeStoryHorizon({media:element,durationMs:selected.story.durationMs,isCurrent,
  /** Обновляет долю прогресса текущего видео по наблюдаемому горизонту. */
  onProgress:(fraction)=>{progress=fraction;},
  /** Переходит к следующей Story после окончания; при ошибке закрывает проигрыватель. */
  onEnded:()=>player.next().catch(player.close),
  /** Предзагружает следующую Story после готовности данных; при ошибке закрывает проигрыватель. */
  onPrepared:()=>player.prepareNext().catch(player.close),
  /** Показывает ошибку медиаресурса для текущего наблюдения. */
  onError:()=>{mediaFailed=true;},
  /** Инвалидирует элемент и снимает наблюдение проигрывания при освобождении горизонта. */
  onRelease:()=>{active=false;releaseObservation();}});
  element.play().then(()=>{if(isCurrent())playBlocked=false;},()=>{if(isCurrent())playBlocked=true;});
  return {destroy:horizon.dispose};
 };
 /** Отображает завершённые сегменты, прогресс текущего готового видео и нули для остальных. */
 const progressFor=(index:number)=>{const current=$view;if(current.kind==="closed")return 0;if(index<current.index)return 1;if(current.kind!=="ready"||index!==current.index)return 0;return progress;};
 /** Повторяет play по явному действию пользователя, обновляя признак блокировки только для актуального элемента. */
 const play=()=>{const element=video;const isCurrent=playbackActive;if(!element||!isCurrent())return;element.play().then(()=>{if(isCurrent())playBlocked=false;},()=>{if(isCurrent())playBlocked=true;});};
</script>
<Dialog open={$view.kind!=='closed'} title={$view.kind==='closed'?copy.stories.feedTitle:$view.group.author.username} description={copy.stories.viewerDescription} closeLabel={copy.common.close} onClose={player.close} onCloseAutoFocus={(event:Event)=>{event.preventDefault();returnFocus();}}>
 {#if $view.kind!=='closed'}
  <div class={styles.player}>
   <fieldset class={styles.progress} aria-label={copy.stories.progress}>
    {#each $view.group.stories as story,index (story.id)}<progress max="1" value={progressFor(index)} aria-label={copy.stories.storyNumber.replace('{number}',String(index+1))}></progress>{/each}
   </fieldset>
   <div class={styles.stage} data-testid="story-stage">
    {#if $view.kind==='ready'}
     {#key $view.story.id+ $view.playback.url}<video class={styles.video} bind:this={video} src={$view.playback.url} controls playsinline preload="metadata" use:attachVideo><track kind="captions" /></video>{/key}
     {#if playBlocked}<Button class={styles.play} onclick={play}>{copy.stories.play}</Button>{/if}
    {:else if $view.kind==='loading'}<p class={styles.stageStatus} role="status">{copy.common.loading}</p>
    {/if}
    {#if $view.kind==='unavailable'||mediaFailed}<div class={styles.stageStatus}><p role="status">{copy.stories.playbackFailed}</p><Button variant="secondary" onclick={()=>player.retry().catch(player.close)}>{copy.common.retry}</Button></div>{/if}
    <div class={styles.navigation}>
     <Button class={styles.navigationButton} variant="secondary" aria-label={copy.stories.previous} disabled={$view.index===0} onclick={()=>player.previous().catch(player.close)}><BackIcon /></Button>
     <Button class={styles.navigationButton} variant="secondary" aria-label={copy.stories.next} onclick={()=>player.next().catch(player.close)}><span class={styles.forwardIcon}><BackIcon /></span></Button>
    </div>
   </div>
   <Button class={styles.contact} variant="text" disabled={$conversation.pending} onclick={contact.run}>{copy.stories.writeAuthor}</Button>
   {#if $conversation.failed}<p role="status">{copy.stories.contactFailed}</p>{/if}
  </div>
 {/if}
</Dialog>
