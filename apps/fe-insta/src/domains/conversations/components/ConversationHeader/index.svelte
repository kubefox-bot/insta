<script lang="ts">
 import { Avatar,Button } from "@insta/fe-core/ui";
 import { BackIcon } from "@insta/fe-core/ui/icons";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {username,identity,backHref,copy}:Props=$props();
 const label=$derived(username||copy.conversations.dialogue);
</script>
<header class={styles.header} data-testid="conversation-header">
 <Button href={backHref} variant="text" class={styles.back} aria-label={copy.common.back} title={copy.common.back}><BackIcon /></Button>
 <Avatar {identity} {username} {label} decorative />
 <h2 class={styles.name} title={label}>{label}</h2>
</header>
