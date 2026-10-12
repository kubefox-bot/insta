<script lang="ts">
  import { Dialog as BitsDialog } from "bits-ui";
  import Button from "../Button/index.svelte";
  import Icon from "../Icon/index.svelte";
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  let { open, title, description, closeLabel, onClose, onCloseAutoFocus, headerClose, children }: Props = $props();
</script>
<BitsDialog.Root {open} onOpenChange={(value) => { if (!value) onClose(); }}>
  <BitsDialog.Portal>
    <BitsDialog.Overlay class={styles.overlay} />
    <BitsDialog.Content class={`${styles.dialog} ${headerClose?styles.responsive:""}`} {onCloseAutoFocus}>
      {#if headerClose}<div class={styles.headerClose}><button class={styles.desktopClose} type="button" aria-label={closeLabel} onclick={onClose}><Icon name="close" /></button><button class={styles.mobileBack} type="button" onclick={onClose}><Icon name="back" />{headerClose.backLabel}</button></div>{/if}
      <BitsDialog.Title class={styles.title}>{title}</BitsDialog.Title>
      <BitsDialog.Description class={styles.description}>{description}</BitsDialog.Description>
      {@render children()}
      {#if !headerClose}<BitsDialog.Close>
        {#snippet child({ props })}<Button {...props} variant="secondary">{closeLabel}</Button>{/snippet}
      </BitsDialog.Close>{/if}
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>
