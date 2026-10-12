<script lang="ts">
  import { Button,Dialog } from "@insta/ui-kit";
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  let { privacy, messages,open,onClose,closeLabel }: Props = $props();
  const view = $derived(privacy.view);
</script>

<Dialog {open} title={messages.settings} description={messages.description} {closeLabel} {onClose}>
  <section class={styles.settings} aria-label={messages.settings}>
    <p>{$view.preference.choice === 'all' ? messages.statusAll : messages.statusNecessary}</p>
    <p>{messages.serverLogsNotice}</p>
    <div class={styles.actions}>
      <Button type="button" class={styles.choice} loading={$view.status === 'saving'} variant="secondary" onclick={() => privacy.change('necessary')}>{messages.necessaryOnly}</Button>
      <Button type="button" class={styles.choice} loading={$view.status === 'saving'} variant="secondary" onclick={() => privacy.change('all')}>{messages.acceptAll}</Button>
    </div>
    {#if $view.status === 'error'}<p role="alert">{messages.saveFailed}</p>{/if}
  </section>
</Dialog>
