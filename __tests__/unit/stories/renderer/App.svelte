<script lang="ts">
 import { onDestroy } from "svelte";
 import { createStoryPlayer,type FeedGroup, StoryPlayer} from "../../../../apps/fe-insta/src/domains/stories/browser/index";
 import copy from "../../../../apps/fe-insta/src/lib/i18n/catalogs/en.json";
 import "@insta/ui-kit/styles.css";
 import {fixtureAuthors,rendererPolicy} from "./conts";
 import type {DeferredContact} from "./types";

 const now=Date.now();
 const group=(author:FeedGroup['author']):FeedGroup=>({author,latestPublishedAt:now,stories:[{id:`story-${author.id}`,author,publishedAt:now,expiresAt:now+rendererPolicy.lifetimeMs,durationMs:rendererPolicy.durationMs}]});
 const groups={a:group(fixtureAuthors.a),b:group(fixtureAuthors.b)};
 const player=createStoryPlayer({clock:{now:Date.now,schedule:(operation,delayMs)=>{const timer=setTimeout(operation,delayMs);return()=>clearTimeout(timer);}},playback:async()=>({url:new URL("../../../fixtures/media/chrome-valid.mp4",import.meta.url).href,expiresAt:Date.now()+rendererPolicy.lifetimeMs}),preloader:{saveData:()=>true,prepare:()=>()=>{}}});
 const requests:DeferredContact[]=[];
 let calls=$state<string[]>([]);
 const requestConversation=({authorId}:Readonly<{authorId:string;isSelected:()=>boolean}>)=>new Promise<void>((resolve,reject)=>{requests.push({resolve,reject:()=>reject(new Error('Controlled contact rejection'))});calls=[...calls,authorId];});
 onDestroy(player.dispose);
</script>
<h1>Story contact renderer</h1>
<button type="button" onclick={()=>player.open(groups.a)}>Open A</button>
<button type="button" onclick={()=>player.open(groups.b)}>Open B</button>
<button type="button" data-testid="resolve-first" onclick={()=>requests[0]?.resolve()}>Resolve first contact</button>
<button type="button" data-testid="reject-first" onclick={()=>requests[0]?.reject()}>Reject first contact</button>
<button type="button" data-testid="resolve-second" onclick={()=>requests[1]?.resolve()}>Resolve second contact</button>
<button type="button" data-testid="reject-second" onclick={()=>requests[1]?.reject()}>Reject second contact</button>
<output data-testid="contact-calls">{JSON.stringify(calls)}</output>
<StoryPlayer {player} {copy} {requestConversation} returnFocus={()=>{}} />
