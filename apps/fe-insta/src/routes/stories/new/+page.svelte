<script lang="ts">
 import {Button} from "@insta/fe-core/ui";
 import {getContext,onMount} from "svelte";
 import {type StoryRecorder,storyRecorderContextKey} from "../../../domains/stories/browser/index";
 import {messages} from "../../../lib/i18n/index";

 let {data}=$props();
 const recorder=getContext<StoryRecorder>(storyRecorderContextKey);
 const copy=$derived(messages[data.locale]);
 let mounted=$state(false);let failed=$state(false);
 onMount(()=>{mounted=true;if(data.ready)recorder.open().catch(()=>{failed=true;});});
</script>
{#if !mounted}
 <section data-testid="story-ready"><h1>{copy.stories.recordTitle}</h1><p>{copy.stories.javascriptRequired}</p><Button href={data.ready?"/conversations":"/"}>{data.ready?copy.stories.exit:copy.stories.guestExit}</Button></section>
{:else if !data.ready}
 <section><h1>{copy.stories.recordTitle}</h1><p>{copy.continuation.story}</p><form method="POST"><Button type="submit">{copy.navigation.signIn}</Button></form><Button href="/" variant="text">{copy.stories.guestExit}</Button></section>
{/if}
{#if failed}<p role="alert">{copy.stories.actionFailed}</p><Button href={data.ready?"/conversations":"/"}>{data.ready?copy.stories.exit:copy.stories.guestExit}</Button>{/if}
