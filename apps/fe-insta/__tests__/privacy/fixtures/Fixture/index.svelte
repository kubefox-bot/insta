<script lang="ts">
 import "@insta/ui-kit/styles.css";
 import type { PublicPreference } from "@insta/contracts/privacy";
 import {Icon,Menu} from "@insta/ui-kit";
 import { untrack } from "svelte";
 import { get } from "svelte/store";
 import { CookieBanner, CookieSettings, createBrowserPreferences, createBrowserSynchronization, createOptionalTelemetry, createPrivacyBrowser } from "../../../../src/domains/privacy/browser/index";
 import { messages } from "../../../../src/lib/i18n/index";

 let {initial}: {initial:PublicPreference}=$props();
 const privacy=createPrivacyBrowser({initial:untrack(()=>initial),preferences:createBrowserPreferences(),synchronization:createBrowserSynchronization(),telemetry:createOptionalTelemetry({adapters:[async()=>{const {createTestAdapter}=await import('../optional-adapter');return createTestAdapter(get(privacy.view).preference.revision);} ]})});
 const view=privacy.view;
let cookieOpen=$state(false);
</script>
<main style="min-height:65vh;padding:1rem">
 <h1>Privacy standalone host</h1>
 <output data-testid="choice">{$view.preference.choice}</output>
 <output data-testid="revision">{$view.preference.revision}</output>
 <button type="button" onclick={()=>window.dispatchEvent(new Event('privacy-observation'))}>Observation</button>
 <textarea aria-label="Functional queue" placeholder="Functional queue"></textarea>
 <Menu label={messages.en.common.settings} items={[{label:messages.en.consent.settings,onSelect:()=>{cookieOpen=true;}}]}><Icon name="settings" /></Menu><CookieSettings {privacy} messages={messages.en.consent} closeLabel={messages.en.common.close} open={cookieOpen} onClose={()=>{cookieOpen=false;}}/>
</main>
<CookieBanner {privacy} messages={messages.en.consent}/>
