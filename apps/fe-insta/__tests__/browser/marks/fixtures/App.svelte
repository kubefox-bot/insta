<script lang="ts">
 import { MessageList, MessageMetadata, messageMarkState } from "../../../../src/domains/conversations/browser/index";
 import type { Message } from "../../../../src/domains/conversations/browser/types";
 import "@insta/fe-core/ui/styles.css";
 import { type Locale, messages } from "../../../../src/lib/i18n/index";
 import threadStyles from "../../../../src/routes/conversations/[id]/styles.module.css";

 let visible=$state(true);let locale=$state<Locale>("ru");let tall=$state(false);let reads=$state<string[]>([]);
 const items:readonly Message[]=$derived(Array.from({length:40},(_,index)=>({id:`m${index}`,conversationId:"c",authorId:index===0?"alice":"bob",text:index===1&&tall?"large incoming\n".repeat(120):`message ${index}`,sequence:index+1,createdAt:"2026-10-11T10:00:00.000Z"})));
 const marks:readonly Message[]=[{id:"sent",conversationId:"c",authorId:"alice",text:"sent",sequence:41,createdAt:"2026-10-11T10:00:00.000Z"},{id:"delivered",conversationId:"c",authorId:"alice",text:"delivered",sequence:42,createdAt:"2026-10-11T10:00:00.000Z",receipt:{deliveredAt:"2026-10-11T10:00:01.000Z",readAt:null}},{id:"read",conversationId:"c",authorId:"alice",text:"Long outgoing message with enough content to wrap on narrow displays and preserve metadata at the bottom of the bubble.",sequence:43,createdAt:"2026-10-11T10:00:00.000Z",receipt:{deliveredAt:"2026-10-11T10:00:01.000Z",readAt:"2026-10-11T10:00:02.000Z"}}];
</script>
<h1>Source component fixture — synthetic receipts</h1>
<div class={threadStyles.messages}>
 <article class={threadStyles.pending} data-testid="pending-message">
  <p>Pending message awaiting delivery</p>
  <span data-testid="pending-status">{messages[locale].outbox.terminal.replace("{code}", "MESSAGE_REJECTED")}</span>
  <MessageMetadata state={messageMarkState({queuedRecord:{state:"terminal",errorCode:"MESSAGE_REJECTED"}})} createdAt="2026-10-11T10:00:00.000Z" {locale} copy={messages[locale]} />
 </article>
</div>
<button type="button" onclick={()=>locale="en"}>English</button><button type="button" onclick={()=>tall=true}>Oversized</button><button type="button" onclick={()=>visible=false}>Unmount</button>
<output data-testid="reads">{reads.join(",")}</output>
<div data-testid="fixture-host">{#if visible}<MessageList items={[...items,...marks]} actorId="alice" copy={messages[locale]} {locale} earlier={false} loading={false} loadEarlier={async()=>{}} readVisible={(ids)=>{reads=[...new Set([...reads,...ids])];}} />{/if}</div>

<style> [data-testid="fixture-host"] { height: 32rem; display: flex; flex-direction: column; } </style>
