<script lang="ts">
 import { Avatar, Button, PlusIcon } from "@insta/fe-core/ui";
 import { tick } from "svelte";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {view,onCreate,onOpen,onRefresh,onLoadMore,createAction,copy}:Props=$props();
 let createTrigger=$state<HTMLButtonElement|null>(null);
 let focusedTrigger=$state<HTMLButtonElement|null>(null);
 let focusedAuthorId=$state<string|null>(null);
 $effect.pre(()=>{
  const authors=view.authors;
  const trigger=focusedTrigger;
  if(!trigger||trigger!==document.activeElement||authors.some(group=>group.author.id===focusedAuthorId))return;
  tick().then(()=>{if(document.activeElement===document.body&&createTrigger?.isConnected)createTrigger.focus();});
 });
</script>
<section class={styles.strip} aria-label={copy.stories.feedTitle} aria-busy={view.pending}>
 <div class={styles.circles}>
  {#snippet createButton()}<button type="submit" class={styles.item} bind:this={createTrigger} onclick={onCreate}><span class={`${styles.circle} ${styles.create}`} aria-hidden="true"><PlusIcon size="lg" /></span><span class={styles.createLabel}>{copy.stories.publishStory}</span></button>{/snippet}
  {@render createAction(createButton)}
  {#each view.authors as group (group.author.id)}
   <button type="button" class={styles.item} aria-label={copy.stories.watchAuthor.replace('{username}',group.author.username)} title={group.author.username} onfocus={(event)=>{focusedTrigger=event.currentTarget;focusedAuthorId=group.author.id;}} onclick={(event)=>onOpen({group,trigger:event.currentTarget})}><span class={styles.circle} aria-hidden="true"><Avatar identity={group.author.id} username={group.author.username} label={group.author.username} decorative /></span><span class={styles.username}>{group.author.username}</span></button>
  {/each}
 </div>
 {#if view.kind==='loading'||view.kind==='unavailable'||view.cursor}
  <div class={styles.status}>
   {#if view.kind==='loading'}<span role="status">{copy.common.loading}</span>
   {:else if view.kind==='unavailable'}<span role="status">{copy.stories.feedUnavailable}</span>{/if}
   {#if view.kind==='unavailable'}<Button variant="text" disabled={view.pending} onclick={onRefresh}>{copy.common.retry}</Button>{/if}
   {#if view.cursor}<Button variant="text" disabled={view.pending} onclick={onLoadMore}>{copy.stories.loadMore}</Button>{/if}
  </div>
 {/if}
</section>
