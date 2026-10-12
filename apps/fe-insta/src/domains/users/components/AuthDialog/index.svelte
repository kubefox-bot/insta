<script lang="ts">
 import { Button, Dialog } from "@insta/fe-core/ui";
 import { authPath } from "../../../auth-continuation/browser/index";
 import LoginForm from "../LoginForm/index.svelte";
 import RegistrationForm from "../RegistrationForm/index.svelte";
 import type { Props } from "./props";

 let {auth,copy,open,onClose,errorCode,selectedIntent,mode,onModeChange,locale,registration,onRegistered,inputTransfer,description}:Props = $props();
</script>
<Dialog {open} title={mode === "login" ? copy.navigation.signIn : copy.navigation.signUp} description={description??copy.auth.required} closeLabel={copy.common.close} {onClose}>
 {#if mode === "register"}
  <RegistrationForm transfer={inputTransfer} {auth} {copy} {locale} {errorCode} {selectedIntent} {onRegistered} stage={registration.stage} expiresAt={registration.expiresAt} action={authPath({mode:"register",intentId:selectedIntent})} onComplete={()=>onModeChange("login")} />
  <Button href={authPath({mode:"login",intentId:selectedIntent})} variant="text" onclick={(event:MouseEvent)=>{event.preventDefault();onModeChange("login");}}>{copy.navigation.signIn}</Button>
 {:else}
  <LoginForm transfer={inputTransfer} {auth} {copy} {errorCode} action={authPath({mode:"login",intentId:selectedIntent})} />
  <Button href={authPath({mode:"register",intentId:selectedIntent})} variant="text" onclick={(event:MouseEvent)=>{event.preventDefault();onModeChange("register");}}>{copy.auth.createAccountPrompt}</Button>
 {/if}
 {#if selectedIntent}<Button variant="secondary" onclick={onClose}>{copy.common.cancel}</Button>{/if}
</Dialog>
