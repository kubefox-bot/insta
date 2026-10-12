<script lang="ts">
 import { MessageErrorCode, SessionErrorCode } from "@insta/contracts/errors";
 import { Button } from "@insta/ui-kit";
 import { getContext, onDestroy, untrack } from "svelte";
 import { get, type Readable, readable } from "svelte/store";
 import { Composer, type ConversationContext, ConversationHeader, conversationConnectionStates, conversationForegroundContextKey, conversationIssues, conversationsContextKey, historyStates, MessageList, MessageMetadata, messageMarkState, resolveRecipientUsername } from "../../../domains/conversations/browser/index";
 import { messages } from "../../../lib/i18n/index";
 import { realtimeErrorCopy } from "../../../lib/realtime/index";
 import styles from "./styles.module.css";

 let {data}=$props();
 const context=getContext<ConversationContext>(conversationsContextKey);
 const foreground=getContext<Readable<boolean>|undefined>(conversationForegroundContextKey)??readable(true);
 const view=context.store.view;
 const draftView=context.drafts.view;
 const directoryNamesView=context.directoryNames;
 const conversation=$derived($view.conversations.find((item)=>item.id===data.conversationId));
 const recipientId=$derived(conversation?.participantIds.find((id)=>id!==$view.actor?.userId));
 const username=$derived(conversation&&$view.actor?resolveRecipientUsername({conversation,actorId:$view.actor.userId,usernames:$directoryNamesView}):null);
 untrack(()=>{context.store.select(data.conversationId);if(data.history&&data.historyActor)context.store.hydrate({actor:data.historyActor,conversationId:data.conversationId,history:data.history});});
 const runtime=$derived(context.runtime());
 const copy=$derived(messages[data.locale]);
 const history=$derived($view.histories.get(data.conversationId));
 const scroll=$derived($view.actor?context.scroll?.bind({actor:$view.actor,conversationId:data.conversationId}):undefined);
 const historyForbidden=$derived(history?.issue===conversationIssues.historyForbidden||(data.historyActor?.userId===$view.actor?.userId&&data.historyActor?.generation===$view.actor?.generation&&data.historyIssue===conversationIssues.historyForbidden));
 const historyUnavailable=$derived(history?.status===historyStates.error||(!history&&Boolean(data.historyIssue)));
 const outboxView=$derived(runtime?.outbox.view);
 const pending=$derived(($outboxView?.records??[]).filter((record)=>record.conversationId===data.conversationId&&!history?.items.some((message)=>message.authorId===$view.actor?.userId&&message.clientMessageId===record.clientMessageId)));
 onDestroy(()=>context.store.select(null));
 const outboxIssueMessage=$derived.by(()=>{
  const issue=$outboxView?.issue;
  if($outboxView?.issueSource==="enqueue")return null;
  switch(issue){
   case undefined:return null;
   case "QUEUE_FULL":return copy.outbox.full;
   case MessageErrorCode.InvalidMessage:return copy.errors.invalidInput;
   case SessionErrorCode.ActorChanged:return copy.auth.actorChanged;
   case SessionErrorCode.AuthUnavailable:return copy.errors.unavailable;
   case "PERSISTENCE_FAILED":return $outboxView?.issueSource==="read"?copy.outbox.unavailable:copy.errors.unavailable;
  }
  return issue satisfies never;
 });
 $effect(()=>{context.store.select(data.conversationId);if(data.history&&data.historyActor)context.store.hydrate({actor:data.historyActor,conversationId:data.conversationId,history:data.history});});
 $effect(()=>{const id=data.conversationId;const current=runtime;if(current&&untrack(()=>get(view).connection)===conversationConnectionStates.connected)current.synchronize(id).catch(()=>context.store.report(conversationIssues.historyUnavailable));});
</script>
<div class={styles.thread} data-history-status={history?.status??"idle"}>
<ConversationHeader {username} identity={recipientId??data.conversationId} backHref="/conversations" {copy} />
<div class={styles.messages}>
{#if historyForbidden}<p role="alert">{copy.conversations.unavailable}</p><Button href="/conversations" variant="secondary">{copy.common.back}</Button>{:else}
{#if $view.connection !== conversationConnectionStates.connected&&!$view.connectionIssue}<p role="status">{$view.connection===conversationConnectionStates.offline?copy.outbox.offline:copy.conversations.reconnecting}</p>{/if}
{#if history?.status === historyStates.loading}<p role="status">{copy.common.loading}</p>{/if}
{#if $view.connectionIssue}<p role="alert" data-testid="connection-error">{realtimeErrorCopy({code:$view.connectionIssue,copy})}</p><Button onclick={()=>runtime?.retry()} variant="secondary">{copy.common.reloadPage}</Button>{/if}
{#if history?.deliveryIssue&&!$view.connectionIssue}<p role="alert" data-testid="delivery-error">{realtimeErrorCopy({code:history.deliveryIssue,copy})}</p><Button onclick={()=>runtime?.retry()} variant="secondary">{copy.common.retry}</Button>{/if}
{#if historyUnavailable&&!history?.deliveryIssue&&!$view.connectionIssue}<p role="alert">{copy.errors.unavailable}</p><Button onclick={()=>runtime?.synchronize(data.conversationId)} variant="secondary">{copy.common.retry}</Button>{/if}
{#if outboxIssueMessage}<p role="alert">{outboxIssueMessage}</p>{#if $outboxView?.issueSource==="read"}<Button onclick={()=>runtime?.outbox.wake().catch(()=>context.store.report(conversationIssues.outboxUnavailable))} variant="secondary">{copy.common.retry}</Button>{/if}{/if}
{#if $view.connection === conversationConnectionStates.error&&!$view.connectionIssue}<Button onclick={()=>runtime?.retry()} variant="secondary">{copy.common.retry}</Button>{/if}
{#if $view.actor}
 {#key `${data.conversationId}:${$view.actor.generation}`}<MessageList isForeground={$foreground} {scroll} items={history?.items??[]} actorId={$view.actor.userId} {copy} locale={data.locale} unavailable={historyUnavailable} earlier={Boolean(history?.earlierCursor)||(history?.items[0]?.sequence??0)>1} loading={history?.status===historyStates.loading} loadEarlier={async()=>{await runtime?.earlier(data.conversationId);}} readVisible={runtime?.receipts.readVisible} />{/key}
 {#each pending as record (record.operationId)}<article class={styles.pending} data-testid="pending-message"><p>{record.text}</p>{#if record.state==="terminal"}<span>{copy.outbox.terminal.replace("{code}",record.errorCode)}</span>{:else}<span>{record.state==="queued"?copy.conversations.waitingForNetwork:copy.conversations.actionRequired}</span>{/if}{#if record.state==="confirmation"}<Button variant="secondary" onclick={()=>runtime?.outbox.confirmResume([record.operationId])}>{copy.outbox.resume}</Button>{/if}<MessageMetadata state={messageMarkState({queuedRecord:record})} createdAt={new Date(record.createdAt).toISOString()} locale={data.locale} {copy} /></article>{/each}
{/if}
{/if}
</div>
{#if $view.actor&&!historyForbidden}
 <div class={styles.composer}>
 {#if runtime}{#key `${data.conversationId}:${$view.actor.generation}`}<Composer {copy} text={$draftView.get(data.conversationId)??""} change={(text)=>{const actor=$view.actor;if(actor)context.drafts.edit({actor,conversationId:data.conversationId,text});}} send={(text)=>runtime.outbox.enqueue({conversationId:data.conversationId,text})} />{/key}{/if}
 </div>
{/if}

</div>
