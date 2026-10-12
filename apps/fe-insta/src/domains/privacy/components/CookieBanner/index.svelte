<script lang="ts">
  import { Button,Icon } from "@insta/ui-kit";
  import { onMount } from "svelte";
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  let { privacy, messages }: Props = $props();
  let bannerHeight = $state(0);
  const view = $derived(privacy.view);
  onMount(() => privacy.mount());
</script>
{#if $view.needsChoice || $view.status === 'error'}
  <div class={styles.reserve} style:--banner-height={`${bannerHeight}px`} aria-hidden="true"></div>
  <aside class={styles.banner} aria-label={messages.title} bind:offsetHeight={bannerHeight}>
    <div class={styles.heading}><Icon name="cookie" /><h2>{messages.title}</h2></div>
    <p>{messages.description}</p>
    <p>{messages.serverLogsNotice}</p>
    <div class={styles.actions}>
      <Button type="button" class={styles.choice} loading={$view.status === 'saving'} variant="secondary" onclick={() => privacy.change('necessary')}>{messages.necessaryOnly}</Button>
      <Button type="button" class={styles.choice} loading={$view.status === 'saving'} variant="secondary" onclick={() => privacy.change('all')}>{messages.acceptAll}</Button>
    </div>
    {#if $view.status === 'error'}<p role="alert">{messages.saveFailed}</p>{/if}
  </aside>
{/if}
