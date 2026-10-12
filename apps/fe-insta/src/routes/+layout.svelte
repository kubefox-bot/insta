<script lang="ts">
 import "@insta/ui-kit/styles.css";
 import "../shared/styles/reset.css";
 import { onDestroy, onMount, setContext,tick,untrack } from "svelte";
 import { derived, get, readable } from "svelte/store";
 import {beforeNavigate,goto,invalidateAll, replaceState} from "$app/navigation";
 import { page } from "$app/state";
 import { createTelemetryBrowser,telemetryContextKey } from "../app/observability/browser/index";
 import { createApplicationRealtime, createRealtimeHost, realtimeHostContextKey } from "../app/realtime/browser/index";
 import { Shell } from "../app/shell/browser/index";
 import { cancelContinuation, createContinuation, createRecovery, createResume, recoveryContextKey, resolveContinuation, resumeContextKey, targetPath} from "../domains/auth-continuation/browser/index";
 import { conversationForegroundContextKey, createConversationTransport, createIndexedDbQueue, createOutboxAuth, createOutboxBroadcast, createPendingDrafts, createUnreadSummary, mountListSynchronization, registerOutboxLogout, unreadSummaryContextKey } from "../domains/conversations/browser/index";
 import { createBrowserPreferences,createBrowserSynchronization,createOptionalTelemetry, createPrivacyBrowser} from "../domains/privacy/browser/index";
 import { createCreationDeparture,createCreationSession,createFeedRefresh,createNativeStoryRecorder,createPublicationTransport,createStoryFeed,createStoryPlayer,createStoryPreview,createStoryRecorder,createStoryTransport,createVideoPreloader,observeFeedVisibility,RecorderDialog,storyPreviewContextKey, storyRecorderContextKey} from "../domains/stories/browser/index";
 import { authContextKey,authInputTransferContextKey,createAuthBrowser,createAuthInputTransfer,createAuthSynchronization,readBrowserSession } from "../domains/users/browser/index";
 import { messages } from "../lib/i18n/index";
 import styles from "./styles.module.css";

 let {data,children} = $props();
 const auth = untrack(()=>createAuthBrowser({initial:data.session,read:readBrowserSession,synchronization:createAuthSynchronization(),
  /** Снимает приватное активное состояние через recovery при очистке auth, используя текущий snapshot; явный logout обрабатывается отдельным callback. */
  clearPrivate:()=>recovery.suspend(get(auth.view)),
  /** Сообщает recovery о явном logout с текущим auth snapshot, чтобы он не восстанавливал прежнее приватное действие. */
  onExplicitLogout:()=>recovery.explicitLogout(get(auth.view))}));
 onMount(()=>registerOutboxLogout({auth:createOutboxAuth(auth),
  /** При logout открывает отдельный ленивый handle очереди, не зависящий от runtime страницы чатов. */
  createQueue:()=>createIndexedDbQueue({factory:indexedDB}),
  /** Уведомляет остальные вкладки после удаления; временный канал закрывается даже при ошибке уведомления. */
  changed:()=>{const changes=createOutboxBroadcast();try{changes.publish();}finally{changes.close();}}
 }));
 const unread=createUnreadSummary({
  /** Создаёт actor-bound транспорт списка conversations и передаёт ему AbortSignal загрузки unread summary; результат и отменой управляет unread-владелец. */
  load:(actor,signal)=>createConversationTransport({actor}).list(signal),
  /** Разрешает обновление unread summary только для видимого документа; чтение браузерного состояния выполняется в момент проверки. */
  visible:()=>document.visibilityState==="visible"});
 const authView=auth.view;
 const unreadView=unread.view;
 setContext(unreadSummaryContextKey,unread);
 const releaseUnreadIdentity=auth.view.subscribe((view)=>unread.reconcileActor(view.actor));
 untrack(()=>{if(data.conversationsActor&&!data.conversationsIssue)unread.seed(data.conversationsActor,{items:data.conversations,totalUnreadCount:data.conversationsTotalUnreadCount});});
 const releaseUnreadCleanup=auth.registerPrivate(unread.clear);
 onDestroy(()=>{releaseUnreadIdentity();releaseUnreadCleanup();unread.dispose();});
 const realtimeHost=createRealtimeHost({auth,unread,create:createApplicationRealtime,
  /** Передаёт realtime host origin текущей страницы для соединения с тем же приложением. */
  ...untrack(()=>data.storiesFeed ? {refreshStories:()=>stories ? stories.feed.refreshForDelivery() : Promise.resolve("stale" as const)} : {}),
  origin:()=>location.origin,
  /** Выдаёт realtime host свежий UUID браузерной криптографией для его протокольных операций. */
  uuid:()=>crypto.randomUUID(),
  /** Передаёт изменения соединения в telemetry-владельца, который применяет действующее согласие. */
  observe:(kind)=>telemetry.observeConnection(kind)});
 setContext(realtimeHostContextKey,realtimeHost);
 onMount(()=>{const dispose=mountListSynchronization({synchronization:unread,onError:unread.reportUnavailable});const release=realtimeHost.mount({window,visibility:document});return ()=>{release();dispose();};});
 const stories=untrack(()=>{
  const initial=data.storiesFeed;if(!initial)return null;
  const clock={now:Date.now,
  /** Планирует callback часов Stories через timeout и возвращает освобождение именно этого таймера; вызвавший feed/player владеет отменой. */
  schedule:(operation:()=>void,delayMs:number)=>{const timer=setTimeout(operation,delayMs);return ()=>clearTimeout(timer);}};
  const transport=createStoryTransport({request:fetch,feedPath:"/api/stories",
  /** Строит BFF playback path с URL-кодированным story id; проверка доступа и медиа выполняется серверным владельцем. */
  playbackPath:(id)=>`/api/stories/${encodeURIComponent(id)}/playback`});
  const preloader=createVideoPreloader({
  /** Проверяет доступный browser connection.saveData, чтобы preloader мог отказаться от лишней загрузки; отсутствие API не включает экономию. */
  saveData:()=>"connection" in navigator && typeof navigator.connection==="object" && navigator.connection!==null && "saveData" in navigator.connection && navigator.connection.saveData===true});
  const feed=createStoryFeed({initial,read:transport.read,clock});
  return {feed,refresh:createFeedRefresh({refresh:feed.refresh}),player:createStoryPlayer({playback:transport.playback,clock,preloader})};
 });
 onDestroy(()=>{stories?.refresh.dispose();stories?.feed.dispose();stories?.player.dispose();});
 onMount(()=>{if(!stories)return;return observeFeedVisibility({visibility:document,
  /** Запрашивает согласованное обновление feed при изменении видимости; ошибку отправляет в auth-диагностику приватной очистки. */
  request:()=>{stories.refresh.request().catch(()=>auth.reportPrivateCleanupFailure());}});});
 $effect(()=>{if(data.storiesFeed)stories?.feed.reconcile(data.storiesFeed);});
 const inputTransfer=createAuthInputTransfer();setContext(authInputTransferContextKey,inputTransfer);
 onDestroy(inputTransfer.clear);
 const pendingDrafts = createPendingDrafts();
 const recovery = createRecovery({ pending: pendingDrafts, create: createContinuation, cancel: cancelContinuation, onCleanupFailure:auth.reportPrivateCleanupFailure,
  /** Выдаёт новый UUID для continuation recovery; существующий intent не переиспользуется этим генератором. */
  uuid: ()=>crypto.randomUUID() });
 const preview=createStoryPreview();setContext(storyPreviewContextKey,preview);
 const releasePreview=recovery.connectStory(preview);
 const publicationTransport=createPublicationTransport({request:fetch,publishPath:"/api/stories",
  /** Формирует URL проверки исхода публикации из закодированного operationId, сохраняя BFF как transport boundary. */
  publicationPath:(id)=>`/api/stories/publications/${encodeURIComponent(id)}`,
  /** Передаёт publication transport актуального actor из auth store в момент операции, а не SSR snapshot. */
  actor:()=>get(auth.view).actor});
 const recorder=createStoryRecorder({preview,session:auth.view,
  /** Создаёт native recorder по полученной backend policy; отсутствие policy бросает ошибку до запуска recorder. Ограничения записи не вычисляются заново из browser env. */
  recorderFactory:()=>{if(!data.storiesPolicy)throw new Error("Stories policy unavailable");return createNativeStoryRecorder(data.storiesPolicy);},...publicationTransport,
  /** Выдаёт криптографический UUID операции recorder для последующего согласования публикации. */
  uuid:()=>crypto.randomUUID(),
  /** После подтверждённой публикации показывает notice, ждёт завершения creation session и запрашивает обновление feed. Каждый из двух сбоев отмечается через auth-диагностику. */
  onPublished:async()=>{publishedNotice=true;await creationSession.finish().catch(()=>auth.reportPrivateCleanupFailure());await stories?.refresh.request().catch(()=>auth.reportPrivateCleanupFailure());},
  /** При необходимости повторной авторизации приостанавливает recovery с текущим snapshot и ждёт auth reconcile, сохраняя владельцев дальнейшего продолжения. */
  continuation:async()=>{recovery.suspend(get(auth.view));await auth.reconcile();}});
 setContext(storyRecorderContextKey,recorder);
 const playerClosed=stories?derived(stories.player.view,(view)=>view.kind==="closed"):readable(true);
 const conversationForeground=derived([recorder.view,playerClosed],([recorderState,closed])=>recorderState.kind==="closed"&&closed);
 setContext(conversationForegroundContextKey,conversationForeground);
 let publishedNotice=$state(false);
 const creationSession=createCreationSession({
  /** Определяет авторизованность creation session по текущему auth actor; не выполняет сетевую проверку самостоятельно. */
  authenticated:()=>Boolean(get(auth.view).actor),navigate:goto,replace:replaceState,settled:tick,recorder});
 let storySelection=0;
 const departure=createCreationDeparture({recorder,
  /** Проверяет наличие сохранённого preview для предупреждения об уходе, не освобождая принадлежащие preview ресурсы. */
  hasPreview:()=>Boolean(preview.capture()),finish:creationSession.returnToHost});
 const previewView=preview.view;const recorderView=recorder.view;
 $effect(()=>{
  const guard=$previewView.kind!=="empty"||$recorderView.kind==="uploading"||$recorderView.kind==="checking";
  if(!guard)return;
  /** Просит браузер предупредить о выгрузке с неопубликованным preview или незавершённой публикацией; enclosing effect владеет установкой и удалением listener. */
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
  window.addEventListener("beforeunload",warn);return ()=>window.removeEventListener("beforeunload",warn);
 });
 beforeNavigate((navigation)=>{
  storySelection++;
  if(creationSession.isNavigating()||navigation.willUnload)return;
  if(get(recorder.view).kind==="closed"){recorder.suspend().catch(()=>auth.reportPrivateCleanupFailure());creationSession.clear();return;}
  if(!departure.hasUnpublished()){recorder.suspend().catch(()=>auth.reportPrivateCleanupFailure());creationSession.clear();return;}
  navigation.cancel();
  const target=navigation.to?.url;if(!target)return;
  departure.request(()=>creationSession.leave(target)).catch(()=>auth.reportPrivateCleanupFailure());
 });
 /** Сохраняет host path и trigger для возврата из записи и запускает выбранный intent. Поколение выбора защищает от позднего результата: неуспешный текущий resume очищает creation session. */
 const beginStoryIntent=async({intentId,trigger}:Readonly<{intentId:string;trigger:HTMLElement|null}>)=>{
  const selection=++storySelection;
  publishedNotice=false;
  creationSession.retain({path:page.url.pathname,trigger});
  if(!await resume({intentId,
  /** Разрешает применение результата resume только пока другой переход или выбор не изменил storySelection; сетевой запрос эта проверка не отменяет. */
  isSelected:()=>selection===storySelection})&&selection===storySelection)creationSession.clear();
 };

 const releaseRecorderLogout=auth.registerLogout(async(actor)=>{recovery.explicitLogout({actor,status:"authenticated"});await recorder.close();});
 onDestroy(()=>{releaseRecorderLogout();recorder.dispose().catch(()=>auth.reportPrivateCleanupFailure());});
 onDestroy(()=>{releasePreview();preview.dispose();});
 const releaseRecoveryIdentity = auth.view.subscribe(recovery.reconcile);
 onDestroy(()=>{releaseRecoveryIdentity();recovery.dispose();});
 setContext(recoveryContextKey,recovery);
 const continuationLifetime={disposed:false};
 const resume=createResume({resolveResume:resolveContinuation,
  /** Даёт resume поколение текущего actor только пока layout жив; после onDestroy запрещает применение позднего результата. */
  currentGeneration:()=>continuationLifetime.disposed?undefined:get(auth.view).actor?.generation,
  /** Открывает разрешённую conversation-цель через клиентскую навигацию; Promise перехода возвращается владельцу resume. */
  openConversation:(target)=>goto(targetPath(target)),
  /** Открывает разрешённую story-цель через creation session, сохраняя её контракт возврата к host. */
  openStory:(target)=>creationSession.open(targetPath(target)),
  /** После resume передаёт intent и target в recovery лишь при наличии текущего actor; восстановлением приватного состояния владеет recovery. */
  onResumed:({intentId,target})=>{const actor=get(auth.view).actor;if(actor)recovery.restore({intentId,target,actor});},onRejected:recovery.reject});
 setContext(resumeContextKey,resume);onDestroy(()=>{continuationLifetime.disposed=true;});
 const telemetry = createTelemetryBrowser(()=>get(privacy.view).preference);
 const privacy = untrack(()=>createPrivacyBrowser({initial:data.privacy,preferences:createBrowserPreferences(),synchronization:createBrowserSynchronization(),telemetry:createOptionalTelemetry({adapters:telemetry.adapters})}));
 setContext(telemetryContextKey,telemetry);
 setContext(authContextKey,auth);
 $effect(()=>{auth.reconcileNavigation(data.session).catch(()=>auth.reportPrivateCleanupFailure());});
 $effect(()=>{document.documentElement.lang=data.locale;});
</script>
<Shell unreadCount={$unreadView.list?.totalUnreadCount} conversationWorkspace={page.route.id?.startsWith("/conversations")&&Boolean($authView.actor)} conversationDetail={page.route.id==="/conversations/[id]"&&Boolean($authView.actor)} onStoryIntent={beginStoryIntent} onStoryPlayback={telemetry.observeStoryPlayback} {stories} storyCreatePath="/stories/new" {inputTransfer} {auth} {privacy} {recovery} locale={data.locale} copy={messages[data.locale]} {children} />

{#if publishedNotice}<p class={styles.publicationNotice} role="status">{messages[data.locale].stories.published}</p>{/if}
{#if stories}<RecorderDialog locale={data.locale} policy={data.storiesPolicy} retryPolicy={invalidateAll} {recorder} {departure} copy={messages[data.locale]} onCloseAutoFocus={(event)=>{if(creationSession.hasHost())event.preventDefault();}} />{/if}
