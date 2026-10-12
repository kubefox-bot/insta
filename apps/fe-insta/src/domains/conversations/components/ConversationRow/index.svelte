<script lang="ts">
 import { Avatar, Indicator } from "@insta/fe-core/ui";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {conversation,selected,actorId,username,copy,activity}:Props=$props();
 const identity=$derived(conversation.participantIds.find((id)=>id!==actorId)??conversation.id);
 const label=$derived(username||copy.conversations.dialogue);
</script>
<a class={styles.row} href={`/conversations/${conversation.id}`} aria-current={selected?"page":undefined} data-testid="conversation-link" title={label}>
 <Avatar {identity} {username} {label} decorative />
 <span class={styles.details}><span class={styles.name}>{label}</span><span class={styles.activity}>{#if activity}<time datetime={new Date(conversation.lastActivityAt).toISOString()}>{activity}</time>{/if}</span></span>
 <Indicator count={conversation.unreadCount} label={copy.conversations.unread} />
</a>
