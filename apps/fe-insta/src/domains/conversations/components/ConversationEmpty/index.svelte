<script lang="ts">
 import { Icon } from "@insta/fe-core/ui";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {copy}:Props=$props();
</script>
<div class={styles.empty} data-testid="conversation-empty"><Icon name="chat" /><p>{copy.conversations.choose}</p></div>
