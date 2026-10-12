<script lang="ts">
 import { otpInputPolicy, passwordLimits, usernameInputPattern, usernameLimits } from "@insta/contracts/auth";
 import { AuthErrorCode, RegistrationErrorCode } from "@insta/contracts/errors";
 import { Button, Input } from "@insta/fe-core/ui";
 import { onDestroy,onMount,untrack } from "svelte";
 import { enhance } from "$app/forms";
 import { createI18n } from "../../../../lib/i18n/index";
 import { createAuthEnhance } from "../../browser/auth-flow";
 import { deadlineDateOptions } from "./conts";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {auth,copy,locale,stage,expiresAt,errorCode,action="/?mode=register",onComplete,onRegistered,selectedIntent,transfer}:Props = $props();
 let email=$state<string|undefined>(undefined);let code=$state<string|undefined>(undefined);let username=$state<string|undefined>(undefined);let password=$state<string|undefined>(undefined);
 onMount(()=>transfer?.view.subscribe((values)=>{if(!values)return;email=values.email;code=values.code;username=values.username;password=values.password;transfer.clear();}));
 let previousStage=untrack(()=>stage);
 $effect(()=>{if(stage===previousStage)return;previousStage=stage;email=undefined;code=undefined;username=undefined;password=undefined;});
 let pending = $state(false);
 let disposed=false;onDestroy(()=>{disposed=true;});
 /**
  * Фиксирует выбранный intent на момент отправки и подключает enhanced auth-форму, чтобы
  * завершение регистрации относилось к исходному выбору.
  */
 const submit:import("$app/forms").SubmitFunction = (input)=>{const chosen=selectedIntent;return createAuthEnhance({auth,
 /**
  * Отражает ожидание auth-действия в локальном состоянии кнопок регистрации.
  */
 onPending:(value)=>{pending=value;},
 /**
  * Уведомляет о переходе к login или успешной регистрации с зафиксированным intent; после
  * уничтожения компонента результат игнорирует.
  */
 onStage:(stage)=>{if(disposed)return;if(stage==="login")onComplete?.();if(stage==="authenticated")onRegistered?.(chosen);}})(input);};
 const i18n = $derived(createI18n({locale,dateOptions:deadlineDateOptions,messages:{deadline:copy.auth.registrationDeadline}}));
</script>
{#if expiresAt}<p>{i18n.t('deadline',{expiresAt:i18n.formatDate(expiresAt)})}</p>{/if}
<form method="POST" {action} use:enhance={submit} class={styles.form} aria-busy={pending}>
 {#if stage === 'start'}
  <input type="hidden" name="step" value="start" />
  <Input label={copy.auth.registrationEmail} type="email" name="email" bind:value={email} autocomplete="email" required aria-invalid={!!errorCode} />
  <Button type="submit" loading={pending}>{pending ? copy.common.loading : copy.auth.sendCode}</Button>
 {:else if stage === 'verify'}
  <input type="hidden" name="step" value="verify" />
  <Input label={copy.auth.registrationCode} type="text" name="code" bind:value={code} inputmode="numeric" autocomplete="one-time-code" pattern={`[0-9]{${otpInputPolicy.digits}}`} minlength={otpInputPolicy.digits} maxlength={otpInputPolicy.digits} required aria-invalid={!!errorCode} />
  <Button type="submit" loading={pending}>{pending ? copy.common.loading : copy.auth.verifyEmail}</Button>
 {:else}
  <input type="hidden" name="step" value="complete" />
  <p>{copy.auth.emailVerified}</p>
  <Input label={copy.auth.registrationUsername} type="text" name="username" bind:value={username} autocomplete="username" pattern={usernameInputPattern} minlength={usernameLimits.min} maxlength={usernameLimits.max} required aria-invalid={!!errorCode} />
  <Input label={copy.auth.password} type="password" name="password" bind:value={password} autocomplete="new-password" required minlength={passwordLimits.minCodePoints} />
  <Button type="submit" loading={pending}>{pending ? copy.common.loading : copy.auth.completeRegistration}</Button>
 {/if}
 {#if errorCode}<p role="alert">{errorCode === RegistrationErrorCode.ResendCooldown || errorCode === AuthErrorCode.AuthRateLimited ? copy.errors.rateLimited : copy.errors.invalidInput}</p>{/if}
</form>
{#if stage === 'verify'}
 <form method="POST" {action} use:enhance={submit} class={styles.form}>
  <input type="hidden" name="step" value="resend" /><Button type="submit" loading={pending}>{copy.auth.resendCode}</Button>
 </form>
{/if}
