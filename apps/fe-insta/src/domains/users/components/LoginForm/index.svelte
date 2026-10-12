<script lang="ts">
 import { passwordLimits } from "@insta/contracts/auth";
 import { Button, Input } from "@insta/fe-core/ui";
 import {onMount} from "svelte";
 import { enhance } from "$app/forms";
 import { createAuthEnhance } from "../../browser/auth-flow";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {auth,copy,errorCode,action="/?mode=login",transfer}:Props = $props();
 let email=$state<string|undefined>(undefined);let password=$state<string|undefined>(undefined);
 onMount(()=>transfer?.view.subscribe((values)=>{if(!values)return;email=values.email;password=values.password;transfer.clear();}));
 let pending = $state(false);
 /**
  * Подключает отправку формы входа к общему auth-сценарию с локальным индикатором ожидания.
  */
 const submit:import("$app/forms").SubmitFunction = (input)=>createAuthEnhance({auth,
 /**
  * Обновляет индикатор ожидания формы при начале и завершении auth-сценария.
  */
 onPending:(value)=>{pending=value;}})(input);
</script>
<form method="POST" {action} use:enhance={submit} class={styles.form} aria-busy={pending}>
 <input type="hidden" name="step" value="login" />
 <Input label={copy.auth.email} type="email" name="email" bind:value={email} autocomplete="username" required aria-invalid={!!errorCode} />
 <Input label={copy.auth.password} type="password" name="password" bind:value={password} autocomplete="current-password" required minlength={passwordLimits.minCodePoints} aria-invalid={!!errorCode} />
 {#if errorCode}<p role="alert">{copy.errors.invalidInput}</p>{/if}
 <Button type="submit" loading={pending}>{pending ? copy.common.loading : copy.navigation.signIn}</Button>
</form>
