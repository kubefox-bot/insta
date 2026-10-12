<script lang="ts">
  import { Button, Icon, Indicator } from "@insta/fe-core/ui";
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  let { count, copy }: Props = $props();
  const label=$derived(typeof count==="number"&&count>0?`${copy.navigation.conversations}: ${copy.conversations.unread}`:copy.navigation.conversations);
</script>
<Button href="/conversations" variant="text" aria-label={label} title={copy.navigation.conversations}>
  <span class={styles.icon}><Icon name="chat" /><span class={styles.indicator}><Indicator {count} label={copy.conversations.unread} /></span></span>
</Button>
