<script lang="ts">
 import MessageMetadata from "../../../../src/domains/conversations/components/MessageMetadata/index.svelte";
 import "@insta/fe-core/ui/styles.css";
 import { type Conversation, ConversationList } from "../../../../src/domains/conversations/browser/index";
 import type { Locale } from "../../../../src/lib/i18n/index";
 import { messages } from "../../../../src/lib/i18n/index";

 let visible=$state(true);
 let locale=$state<Locale>("ru");
 let lastActivityAt=$state(Date.parse("2026-10-11T10:30:00Z"));
 const conversations: readonly Conversation[]=$derived([{id:"dialogue",participantIds:["alice","bob"],recipientUsername:"Bob",lastSequence:1,lastActivityAt}]);
</script>
<button type="button" onclick={()=>locale="en"}>English</button>
<button type="button" onclick={()=>lastActivityAt=Date.parse("2026-10-11T20:00:00Z")}>New activity</button>
<button type="button" onclick={()=>visible=false}>Unmount</button>
{#if visible}<ConversationList {conversations} {locale} actorId="alice" selectedId={null} copy={messages[locale]} />{/if}

<div data-testid="metadata" style="width: 10rem">
 <MessageMetadata createdAt="2026-10-11T10:30:00.000Z" {locale} copy={messages[locale]} state={{kind:"sent"}} />
</div>
