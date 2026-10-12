<script lang="ts">
 import { SessionErrorCode } from "@insta/contracts/errors";
 import { Button,Dialog,Menu,SettingsIcon } from "@insta/fe-core/ui";
 import { onDestroy,onMount,setContext,tick,untrack } from "svelte";
 import {get} from "svelte/store";
 import { enhance } from "$app/forms";
 import {beforeNavigate,goto} from "$app/navigation";
 import { page } from "$app/state";
 import { authPath,createContinuationAction,createContinuationSelection } from "../../../../../domains/auth-continuation/browser/index";
 import { ConversationNavigation } from "../../../../../domains/conversations/browser/index";
 import { CookieBanner,CookieSettings } from "../../../../../domains/privacy/browser/index";
 import {StoryPlayer, StoryStrip,storyRailContextKey} from "../../../../../domains/stories/browser/index";
 import { TechnicalDialog } from "../../../../../domains/support-reports/browser/index";
 import { AccountMenu,AuthDialog,createAuthDialogOperations,createAuthEnhance,readAuthClickMode } from "../../../../../domains/users/browser/index";
 import Header from "../../../../../shared/components/Header/index.svelte";
 import LocaleControls from "../../../../../shared/components/LocaleControls/index.svelte";
 import HydrationReveal from "../HydrationReveal/index.svelte";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {children,copy,locale,auth,privacy,recovery,inputTransfer,stories,storyCreatePath,onStoryPlayback,onStoryIntent,unreadCount,conversationWorkspace=false,conversationDetail=false}:Props = $props();
 let storyTrigger:HTMLButtonElement|null = null;
 let storyCreateForm=$state<HTMLFormElement|null>(null);
 const storyFeedView=$derived(stories?.feed.view);
 let open = $state(false);
 let supportOpen = $state(false);
 let cookieOpen=$state(false);
 let languageOpen=$state(false);
 let authTarget=$state<Readonly<{intentId:string;type:Parameters<typeof recovery.begin>[0]["input"]["type"]}>|null>(null);
 let logoutForm=$state<HTMLFormElement|null>(null);
 let mode=$state<"login"|"register">("login");
 let pending = $state(false);
 const selection=untrack(()=>createContinuationSelection({cancel:recovery.cancel}));
 const dismissedIntent=selection.view;
 const dialog=untrack(()=>createAuthDialogOperations({inputTransfer,chooseAuthentication:recovery.chooseAuthentication}));
 let outageDismissed=$state(false);
 const view = $derived(auth.view);
 const recoveryView = $derived(recovery.view);
 const actor=$derived($view.actor);
 const fallbackMode=$derived(page.url.pathname==="/" ? page.url.searchParams.get("mode") : null);
 const selectedIntent=$derived(selection.select({recovery:$recoveryView,projectedIntent:page.data.selectedIntent,dismissedIntent:$dismissedIntent,cancelled:Boolean(page.form && "cancelled" in page.form && page.form.cancelled)}));
 const authDescription=$derived.by(()=>{
  if(!selectedIntent||authTarget?.intentId!==selectedIntent)return copy.auth.required;
  switch(authTarget.type){
   case "open_conversation":case "compose_message":return copy.continuation.message;
   case "create_story":case "resume_story":return copy.continuation.story;
   default:{const unexpected:never=authTarget.type;return unexpected;}
  }
 });
 $effect(()=>{if($view.status!=="unavailable")outageDismissed=false;});
 $effect(()=>{if($view.actor){dialog.authenticated();authTarget=null;open=false;}});
 $effect(()=>{const initial=fallbackMode;if(initial==="login"||initial==="register"){mode=initial;open=!actor;}});
 /**
  * Переключает login/register через auth dialog owner с выбранным intent и обновляет локальный
  * режим формы.
  */
 const chooseMode=(next:"login"|"register")=>{dialog.chooseMode({mode:next,intentId:selectedIntent});mode=next;};
 /**
  * Перехватывает подходящую auth ссылку, закрывает support dialog и открывает выбранный режим
  * входа; остальные клики оставляет браузеру.
  */
 const openAuth=(event:MouseEvent)=>{const next=readAuthClickMode({event,currentUrl:page.url});if(!next)return;event.preventDefault();chooseMode(next);supportOpen=false;open=true;};
 /**
  * Закрывает auth dialog, сбрасывает локальную цель и отменяет выбранный continuation; ошибка
  * отмены попадает в private cleanup диагностику.
  */
 const closeDialog = ()=>{const intent=selectedIntent;dialog.close();authTarget=null;open=false;selection.cancel(intent).catch(()=>auth.reportPrivateCleanupFailure());};
 const actions=untrack(()=>createContinuationAction({
  begin:recovery.begin,cancel:recovery.cancel,currentIdentity:()=>get(auth.view),subscribeIdentity:auth.view.subscribe,
  openConversation:({intentId})=>goto(`/continue?intentId=${intentId}`),
  openStory:onStoryIntent,
  openAuthentication:(target)=>{authTarget=target;chooseMode("login");open=true;}
 }));
 beforeNavigate(()=>actions.invalidate());
 onDestroy(()=>actions.dispose());
 /**
  * Начинает создание Story с новым operationId и элементом возврата фокуса через общий
  * continuation сценарий.
  */
 const createStory=(trigger:HTMLElement|null)=>actions.begin({input:{type:"create_story",operationId:crypto.randomUUID()},trigger,isSelected:()=>true});
 /**
  * Отменяет стандартную enhanced отправку Story формы и запускает continuation от submitter;
  * ошибку сообщает auth диагностике.
  */
 const beginStory:import("$app/forms").SubmitFunction=({cancel,submitter})=>{cancel();createStory(submitter).catch(()=>auth.reportPrivateCleanupFailure());};
 /**
  * Перехватывает Story create click и сохраняет HTMLElement как focus trigger; сбой начала
  * сценария сообщает auth owner.
  */
 const createStoryClick=(event:MouseEvent)=>{event.preventDefault();createStory(event.currentTarget instanceof HTMLElement?event.currentTarget:null).catch(()=>auth.reportPrivateCleanupFailure());};
 /**
  * Начинает открытие диалога с выбранным получателем через continuation с новым operationId.
  */
 const requestConversation=async({authorId,isSelected}:Readonly<{authorId:string;isSelected:()=>boolean}>)=>{await actions.begin({input:{type:"open_conversation",recipientId:authorId,operationId:crypto.randomUUID()},trigger:null,isSelected});};
 /**
  * После Svelte tick возвращает фокус на сохранившийся Story trigger либо кнопку создания;
  * открытый auth dialog не теряет фокус.
  */
 const returnStoryFocus=()=>{tick().then(()=>{if(open)return;const target=storyTrigger?.isConnected?storyTrigger:storyCreateForm?.querySelector<HTMLButtonElement>('button[type="submit"]');target?.focus();});};
 /**
  * Отменяет стандартную enhanced отправку cancel формы и закрывает dialog с отменой текущего
  * intent.
  */
 const cancelSelected:import("$app/forms").SubmitFunction=({cancel})=>{cancel();closeDialog();};
 /**
  * Подключает auth enhancement к форме shell, отдавая обработку session-результата auth owner
  * и отражая pending локально.
  */
 const submit:import("$app/forms").SubmitFunction = (input)=>createAuthEnhance({auth,
 /** Обновляет локальный pending shell по lifecycle enhanced auth отправки. */
 onPending:(value)=>{pending=value;}})(input);
 setContext(storyRailContextKey,storyRail);
 onMount(()=>auth.mount());
</script>
<svelte:head><title>Insta</title></svelte:head>
<svelte:window onclickcapture={openAuth} />
<div class={`${styles.shell} ${conversationWorkspace?styles.workspace:""} ${conversationDetail?styles.detail:""}`}>
 <HydrationReveal />
 <div class={styles.globalHeader}>
 <Header brandLabel="Insta" brandHref="/">
  {#snippet navigation()}
   <ConversationNavigation count={unreadCount} {copy} />
  {/snippet}
  {#snippet accountActions()}
   {#if !$view.actor}
    <Menu label={copy.common.settings} items={[{label:copy.common.language,onSelect:()=>{languageOpen=true;}},{label:copy.consent.settings,onSelect:()=>{cookieOpen=true;}},{label:copy.support.reportProblem,onSelect:()=>{supportOpen=true;open=false;}}]}><SettingsIcon /></Menu>
    <noscript><LocaleControls {locale} {copy} /></noscript>
   {/if}
   {#if $view.actor}
    <noscript><LocaleControls {locale} {copy} /></noscript>
    <AccountMenu username={$view.actor.username} identity={$view.actor.userId} {copy} {pending} onLanguage={()=>{languageOpen=true;}} onPrivacy={()=>{cookieOpen=true;}} onSupport={()=>{supportOpen=true;open=false;}} onLogout={()=>logoutForm?.requestSubmit()} />
    <form method="POST" action="/" use:enhance={submit} bind:this={logoutForm}>
     <input type="hidden" name="step" value="logout" />
     <input type="hidden" name="generation" value={$view.actor.generation} />
     <noscript><Button type="submit" variant="secondary">{copy.navigation.signOut}</Button></noscript>
    </form>
   {:else if $view.status === "pending" || pending}
    <Button variant="secondary" disabled loading>{copy.auth.pending}</Button>
   {:else if $view.status === "unavailable"}
    <span class={styles.accountStatus}>{copy.errors.unavailable}</span>
   {:else}
    <Button href={authPath({mode:"login",intentId:selectedIntent})} variant="primary">{copy.navigation.signIn}</Button>
   {/if}
  {/snippet}
 </Header>
 </div>
 {#if !conversationWorkspace}<div class={styles.publicRail}>{@render storyRail()}</div>{/if}
 {#if stories}<StoryPlayer onPlayback={onStoryPlayback} player={stories.player} {copy} {requestConversation} returnFocus={returnStoryFocus} />{/if}
 {#if page.form?.code === SessionErrorCode.ActorChanged}<p role="status">{copy.auth.actorChanged}</p>{/if}
 {#if $view.status === 'unavailable'}<p role="status">{copy.errors.unavailable}</p>{/if}
 {#if $view.revocation === 'pending'}<p role="status">{copy.auth.pendingRevocation}</p>{/if}
 {#if $view.actor && selectedIntent}<div class={styles.intentActions}><Button href={`/continue?intentId=${selectedIntent}`}>{copy.common.continue}</Button><form method="POST" action={authPath({mode:"login",intentId:selectedIntent})} use:enhance={cancelSelected}><input type="hidden" name="intentId" value={selectedIntent} /><Button name="step" value="cancel" type="submit" variant="text">{copy.common.cancel}</Button></form></div>{/if}
 {#if $recoveryView.kind === "unavailable"}<p role="status">{copy.continuation.unavailable}</p>{/if}
 <main class={styles.main}>{@render children()}</main>
 <Dialog open={languageOpen} title={copy.common.language} closeLabel={copy.common.close} onClose={()=>{languageOpen=false;}}><LocaleControls {locale} {copy} /></Dialog>
 <CookieSettings {privacy} messages={copy.consent} closeLabel={copy.common.close} open={cookieOpen} onClose={()=>{cookieOpen=false;}} />
 <CookieBanner {privacy} messages={copy.consent} />
 <AuthDialog description={authDescription} {inputTransfer} {selectedIntent} {auth} {copy} {locale} {mode} registration={page.data.registration} onModeChange={chooseMode} onRegistered={recovery.confirmRegistration} open={open && $view.status === "guest"} onClose={closeDialog} errorCode={typeof page.form?.code === "string" ? page.form.code : undefined} />
 <TechnicalDialog {copy} open={supportOpen||$view.issue!==undefined||($view.status==="unavailable"&&!outageDismissed)} errorCode={$view.issue??($view.status==="unavailable"?SessionErrorCode.SessionUnavailable:"TECHNICAL_PROBLEM")} originalRequestId={page.data.requestId} onClose={()=>{supportOpen=false;outageDismissed=true;auth.clearSubmissionIssue();}} />
</div>

{#snippet storyRail()}
 {#if stories && $storyFeedView}
  <div class={styles.storyRail}>
  <StoryStrip view={$storyFeedView} {copy} onCreate={createStoryClick} onOpen={({group,trigger})=>{storyTrigger=trigger;stories?.player.open(group).catch(()=>stories?.player.close());}} onRefresh={()=>stories?.refresh.request().catch(()=>auth.reportPrivateCleanupFailure())} onLoadMore={()=>stories?.feed.loadMore().catch(()=>auth.reportPrivateCleanupFailure())}>
   {#snippet createAction(content)}<form method="POST" action={storyCreatePath} bind:this={storyCreateForm} use:enhance={beginStory}>{@render content()}</form>{/snippet}
  </StoryStrip>
  </div>
 {/if}
{/snippet}
