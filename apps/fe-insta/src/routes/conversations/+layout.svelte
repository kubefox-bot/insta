<script lang="ts">
 import { ContinuationErrorCode } from "@insta/contracts/errors";
 import { Button } from "@insta/ui-kit";
 import { getContext, onDestroy, type Snippet, setContext, untrack} from "svelte";
 import { get } from "svelte/store";
 import { goto } from "$app/navigation";
 import { page } from "$app/state";
 import { createAccountNavigation, createConversationRuntime } from "../../app/conversations/browser/index";
 import { type createTelemetryBrowser,telemetryContextKey } from "../../app/observability/browser/index";
 import { type RealtimeHost, realtimeHostContextKey } from "../../app/realtime/browser/index";
 import { authPath, type Recovery, recoveryContextKey } from "../../domains/auth-continuation/browser/index";
 import { type ConversationContext, ConversationHeading, ConversationList, type ConversationRuntime, conversationIssues, conversationsContextKey, createConversationDrafts, createConversationScroll, createConversationStore, createDirectoryNames, type UnreadSummary, unreadSummaryContextKey } from "../../domains/conversations/browser/index";
 import { storyRailContextKey } from "../../domains/stories/browser/index";
 import { type AuthBrowser, authContextKey } from "../../domains/users/browser/index";
 import { UserSearch } from "../../domains/users/browser/search/index";
 import { messages } from "../../lib/i18n/index";
 import { realtimeErrorCopy } from "../../lib/realtime/index";
 import styles from "./styles.module.css";

 let {data,children}=$props();
 const storyRail=getContext<Snippet|undefined>(storyRailContextKey);
 const auth=getContext<AuthBrowser>(authContextKey);
 const unread=getContext<UnreadSummary>(unreadSummaryContextKey);
 const realtimeHost=getContext<RealtimeHost>(realtimeHostContextKey);
 const unreadView=unread.view;
 untrack(()=>{if(data.conversationsActor&&!data.conversationsIssue)unread.seed(data.conversationsActor,{items:data.conversations,totalUnreadCount:data.conversationsTotalUnreadCount});});
 const telemetry=getContext<ReturnType<typeof createTelemetryBrowser>>(telemetryContextKey);
 const view=auth.view;
 const store=untrack(()=>createConversationStore({initial:data.conversations,actor:data.session.actor}));
 const conversationView=store.view;
 const drafts=createConversationDrafts();
 const scroll=createConversationScroll();
 const releaseScrollIdentity=auth.view.subscribe(scroll.reconcile);
 const releaseScrollCleanup=auth.registerPrivate(scroll.clear);
 onDestroy(()=>{releaseScrollIdentity();releaseScrollCleanup();scroll.dispose();});
 const recovery=getContext<Recovery>(recoveryContextKey);
 const releaseRecoverySource=recovery.connect({
  /** Снимает drafts для текущего conversation store по запросу recovery; последующее восстановление подключено отдельным drafts.edit. */
  capture:()=>drafts.capture(get(store.view)),
  restore:drafts.edit,
 });
 onDestroy(releaseRecoverySource);
 const directoryNames=createDirectoryNames();
 const directoryNamesView=directoryNames.view;
 const releaseDirectoryIdentity=auth.view.subscribe(directoryNames.reconcile);
 const releaseDirectoryCleanup=auth.registerPrivate(directoryNames.clear);
 onDestroy(()=>{releaseDirectoryIdentity();releaseDirectoryCleanup();directoryNames.dispose();});
 const releaseDraftIdentity=auth.view.subscribe(drafts.reconcile);
 onDestroy(()=>{releaseDraftIdentity();drafts.dispose();});
 const hydration={pending:true};
 let runtime=$state<ConversationRuntime|null>(null);
 const copy=$derived(messages[data.locale]);
 const accountNavigation=untrack(()=>createAccountNavigation({initialUserId:data.session.actor?.userId??null,isDetail:()=>Boolean(page.params.id),navigate:goto}));
 $effect(()=>{accountNavigation.reconcile($view.actor).catch(()=>store.report(conversationIssues.conversationsUnavailable));});
 const identity=$derived($view.actor ? `${$view.actor.userId}:${$view.actor.generation}` : null);
 setContext(conversationsContextKey,{store,drafts,scroll,directoryNames:directoryNames.view,
  /** Предоставляет потребителям context текущий runtime либо null; его создание и dispose принадлежат identity effect этого layout. */
  runtime:()=>runtime} satisfies ConversationContext);
 $effect(()=>{
  const currentIdentity=identity;
  const actor=untrack(()=>get(auth.view).actor);
  if(!currentIdentity){hydration.pending=false;store.reconcileActor(null);return;}
  store.reconcileActor(actor);
  if(!actor)return;
  const snapshot=untrack(()=>({actor:data.conversationsActor,conversations:data.conversations,issue:data.conversationsIssue}));
  const initialHydration=hydration.pending&&!snapshot.issue&&snapshot.actor?.userId===actor.userId&&snapshot.actor.generation===actor.generation;hydration.pending=false;
  if(snapshot.actor&&!snapshot.issue)store.applyList({actor:snapshot.actor,conversations:snapshot.conversations});
  const created=createConversationRuntime({store,actor,auth,unread,realtimeHost,navigate:goto,observe:telemetry.observeConnection,initialHydration,
  /** Восстанавливает продолженное действие для actor, которому принадлежит созданный runtime; callbacks другого поколения не получают новую identity автоматически. */
  onResumed:({intentId,target})=>recovery.restore({intentId,target,actor}),
  /** Отмечает отклонённый intent в recovery и сообщает conversations store о недоступности продолжения. */
  onRejected:(intentId)=>{recovery.reject(intentId);store.report(ContinuationErrorCode.IntentUnavailable);}});runtime=created;
  return ()=>{runtime=null;created.dispose();};
 });
 $effect(()=>{const intentId=page.url.searchParams.get("intentId");const current=runtime;if(intentId&&current)current.resume({intentId}).catch(()=>store.report(ContinuationErrorCode.IntentUnavailable));});
 $effect(()=>{if(data.conversationsIssue)store.report(data.conversationsIssue);});
 $effect(()=>{const actor=data.conversationsActor;const conversations=data.conversations;if(actor&&!data.conversationsIssue){const snapshot=untrack(()=>get(unread.view));const owned=snapshot.actor?.userId===actor.userId&&snapshot.actor.generation===actor.generation;store.applyList({actor,conversations:owned&&snapshot.list?snapshot.list.items:conversations});}});
</script>
{#if $view.actor}
 <div class={`${styles.workspace} ${page.params.id ? styles.detail : ""}`}>
  <section class={styles.panel} data-testid="conversation-panel">{@render children()}</section>
  <aside class={styles.sidebar} data-testid="conversation-sidebar">
   {@render storyRail?.()}
   <ConversationHeading count={$unreadView.list?.totalUnreadCount} {copy} />
   {#if runtime}{#key runtime}<UserSearch {copy} search={runtime.search} open={runtime.open} onResults={directoryNames.capture($view.actor)} />{/key}{/if}
   <ConversationList conversations={$conversationView.conversations} selectedId={page.params.id??null} actorId={$view.actor.userId} usernames={$directoryNamesView} {copy} locale={data.locale} />
   {#if $conversationView.connectionIssue&&!page.params.id}<p role="alert" data-testid="connection-error">{realtimeErrorCopy({code:$conversationView.connectionIssue,copy})}</p><Button onclick={()=>runtime?.retry()} variant="secondary">{copy.common.reloadPage}</Button>{/if}
   {#if $unreadView.issue&&!$conversationView.connectionIssue}<p role="alert" data-testid="unread-delivery-error">{realtimeErrorCopy({code:$unreadView.issue,copy})}</p><Button onclick={()=>realtimeHost.retryUnread()} variant="secondary">{copy.common.retry}</Button>{/if}
   {#if $conversationView.issue}<p role="alert">{copy.errors.unavailable}</p>{/if}
  </aside>
 </div>
{:else}<div class={styles.empty}><h1>{copy.conversations.welcomeTitle}</h1><p>{copy.auth.required}</p><Button href={authPath({mode:"login"})}>{copy.conversations.authenticate}</Button></div>{/if}
