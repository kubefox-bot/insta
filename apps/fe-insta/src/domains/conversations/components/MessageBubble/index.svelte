<script lang="ts">
 import { messageMarkState } from "../../browser/receipts/domain/message-mark";
 import MessageMetadata from "../MessageMetadata/index.svelte";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let { message, actorId, locale, copy }: Props = $props();
 const own = $derived(message.authorId === actorId);
</script>
<li class={styles.bubble} data-own={own} data-message-id={message.id} data-author-id={message.authorId}>
 <span class={styles.text}>{message.text}</span>
 <MessageMetadata state={own ? messageMarkState({message}) : undefined} createdAt={message.createdAt} {locale} {copy} />
</li>
