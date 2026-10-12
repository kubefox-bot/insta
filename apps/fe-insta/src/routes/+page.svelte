<script lang="ts">
 import { ContinuationErrorCode } from "@insta/contracts/errors";
 import { Button } from "@insta/fe-core/ui";
 import { getContext,onMount } from "svelte";
 import { page } from "$app/state";
 import { authPath } from "../domains/auth-continuation/browser/index";
 import { type AuthBrowser,type AuthInputTransfer,authContextKey,authInputTransferContextKey,LoginForm,RegistrationForm } from "../domains/users/browser/index";
 import { messages } from "../lib/i18n/index";
 import styles from "./styles.module.css";

 let {data,form} = $props();
 const inputTransfer=getContext<AuthInputTransfer>(authInputTransferContextKey);
 let authPanel=$state<HTMLElement|undefined>(undefined);
 const auth=getContext<AuthBrowser>(authContextKey);
 const view=auth.view;
 const copy = $derived(messages[data.locale]);
 const mode=$derived(page.url.searchParams.get("mode"));
 let hydrated=$state(false);onMount(()=>{if(authPanel)inputTransfer.capture(authPanel);hydrated=true;});
</script>
{#if (!hydrated || $view.actor) && (mode === "login" || mode === "register")}
 <section class={styles.authPanel} bind:this={authPanel}>
  {#if $view.actor}<h1>{$view.actor.username}</h1>{#if !hydrated && !data.selectedIntent}<Button href={data.selectedIntent ? `/conversations?intentId=${data.selectedIntent}` : "/conversations"}>{copy.common.continue}</Button>{/if}
  {:else if $view.status !== "guest"}<h1>{copy.errors.unavailable}</h1>
  {:else if mode === "register"}<h1>{copy.navigation.signUp}</h1><RegistrationForm {auth} {copy} locale={data.locale} stage={data.registration.stage} expiresAt={data.registration.expiresAt} errorCode={form && 'code' in form ? form.code : undefined} action={authPath({mode:"register",intentId:data.selectedIntent})} /><Button href={authPath({mode:"login",intentId:data.selectedIntent})} variant="text">{copy.navigation.signIn}</Button>
  {:else}<h1>{copy.navigation.signIn}</h1><LoginForm {auth} {copy} errorCode={form && 'code' in form ? form.code : undefined} action={authPath({mode:"login",intentId:data.selectedIntent})} /><Button href={authPath({mode:"register",intentId:data.selectedIntent})} variant="text">{copy.auth.createAccountPrompt}</Button>{/if}
  {#if !$view.actor && data.selectedIntent && !(form && "cancelled" in form && form.cancelled)}<form method="POST"><input type="hidden" name="intentId" value={data.selectedIntent} /><Button name="step" value="cancel" type="submit" variant="secondary">{copy.common.cancel}</Button></form>{/if}
  {#if form && "code" in form && form.code === ContinuationErrorCode.IntentUnavailable}<p role="status">{copy.continuation.unavailable}</p>{/if}
 </section>
{:else}
 <section class={styles.welcome}>
  <p class={styles.eyebrow}>{copy.home.eyebrow}</p><h1>{copy.home.title}</h1><p class={styles.description}>{copy.home.description}</p>
  <Button href={data.session.actor ? "/conversations" : authPath({mode:"login"})} size="lg">{data.session.actor ? copy.home.memberAction : copy.home.guestAction}</Button>
 </section>
{/if}
