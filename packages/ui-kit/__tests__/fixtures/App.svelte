<script lang="ts">
  import { Avatar, BackIcon, Button, CameraIcon, CheckIcon, ClearIcon, ClockIcon, CloseIcon, Dialog, DoubleCheckIcon, ErrorIcon, Icon, Input, PlusIcon, SearchIcon, SendIcon, SettingsIcon, Textarea } from "@insta/fe-core/ui";
  import { Menu } from "@insta/ui-kit";
  import avatarStyles from "./avatars.module.css";
  import compactStyles from "./compact.module.css";
  import splitStyles from "./split.module.css";
  import "@insta/fe-core/ui/styles.css";

  let submissions = $state(0);
  let formData = $state("");
  let inputEvent = $state("");
  let loading = $state(false);
  let open = $state(false);
  let headerOpen = $state(false);
  let menuSelection=$state("");
</script>
<h1>UI fixtures ready</h1>
<form onsubmit={(event) => { event.preventDefault(); formData = JSON.stringify([...new FormData(event.currentTarget, event.submitter)]); submissions += 1; loading = true; }}>
  <Input label="Email" name="email" type="email" oninput={(event) => { inputEvent = event.currentTarget.value; }} />
  <Textarea label="Message" name="message" />
  <Button type="submit" name="action" value="send" {loading}>Submit</Button>
  <Button type="submit" disabled>Disabled submit</Button>
</form>
<output data-testid="form-data">{formData}</output>
<output data-testid="input-events">{inputEvent}</output>
<output data-testid="submissions">{submissions}</output>
<Input label="Invalid email" error="Email error" />
<Input label="Readonly email" value="readonly@example.test" readonly />
<Input label="Disabled field" disabled />
<Textarea label="Invalid message" error="Message error" />
<Button href="#destination">Native link</Button>
<Button href="#disabled" disabled>Disabled link</Button>
<Button href="#loading" loading>Loading link</Button>
{#each ["primary", "secondary", "text"] as const as variant}
  {#each ["sm", "md", "lg"] as const as size}
    <Button {variant} {size}>{variant} {size}</Button>
  {/each}
{/each}
<Button loading>Loading action</Button>
<Button onclick={() => { open = true; }}>Open dialog</Button>
<Dialog {open} title="Fixture dialog" description="Dialog description" closeLabel="Close dialog" onClose={() => { open = false; }}>
  <Input label="Dialog field" />
</Dialog>
<Button onclick={() => { headerOpen = true; }}>Open header dialog</Button>
<Dialog open={headerOpen} title="Header dialog" description="Header dialog description" closeLabel="Close header dialog" headerClose={{backLabel:"Back from header dialog"}} onClose={() => { headerOpen = false; }}>
  <Input label="Header dialog field" />
</Dialog>
<div id="destination">Destination</div>

<Menu label="Fixture settings" items={[{label:"First action",onSelect:()=>{menuSelection="First action";}},{label:"Open owned dialog",onSelect:()=>{open=true;}}]}>Settings</Menu>
<output data-testid="menu-selection">{menuSelection}</output>

<div class={compactStyles.compact} data-testid="compact-layout">Compact layout</div>
<div class={splitStyles.split} data-testid="split-layout">Split layout</div>

<section aria-label="Messenger atom fixtures" class={avatarStyles.fixtures}>
  <Avatar identity="edd" username="Edd" label="Edd avatar" />
  <span data-testid="avatar-unicode"><Avatar identity="unicode" username="👩🏽‍💻alice" label="Unicode avatar" /></span>
  <span data-testid="avatar-unknown"><Avatar identity="unknown" username={null} label="Unknown avatar" /></span>
  <Button aria-label="Open Edd account"><Avatar identity="edd" username="Edd" label="Edd" decorative /></Button>
  <a href="#destination" class={avatarStyles.row} data-testid="avatar-long-name" aria-label="VeryLongUsernameThatMustRemainAccessibleWithoutWideningTheRow"><Avatar identity="long" username="VeryLongUsernameThatMustRemainAccessibleWithoutWideningTheRow" label="VeryLongUsernameThatMustRemainAccessibleWithoutWideningTheRow" decorative /><span class={avatarStyles.name}>VeryLongUsernameThatMustRemainAccessibleWithoutWideningTheRow</span></a>
  {#each ["A", "B", "C", "D", "E"] as identity}
    <span data-testid="avatar-palette"><Avatar {identity} username="Ed" label={`Palette ${identity}`} /></span>
  {/each}
  <Button aria-label="Icon Search"><SearchIcon /></Button>
  <Button aria-label="Icon Clear"><ClearIcon /></Button>
  <Button aria-label="Icon Send"><SendIcon /></Button>
  <Button aria-label="Icon Back"><BackIcon /></Button>
  <Button aria-label="Icon Close"><CloseIcon /></Button>
  <Button aria-label="Icon Camera"><CameraIcon /></Button>
  <Button aria-label="Icon Plus"><PlusIcon /></Button>
  <Button aria-label="Icon Settings"><SettingsIcon /></Button>
  <Button aria-label="Icon Clock"><ClockIcon /></Button>
  <Button aria-label="Icon Check"><CheckIcon /></Button>
  <Button aria-label="Icon DoubleCheck"><DoubleCheckIcon /></Button>
  <Button aria-label="Icon Error"><ErrorIcon /></Button>
  <span data-testid="icon-small"><SearchIcon size="sm" /></span>
  <span data-testid="icon-medium"><SendIcon size="md" tone="muted" /></span>
  <span data-testid="icon-large"><ErrorIcon size="lg" tone="error" /></span>
  <span data-testid="icon-legacy"><Icon name="settings" /></span>
</section>
