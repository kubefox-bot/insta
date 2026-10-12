import { hydrate, mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("Fixture mount target is missing");
const renderFixture = target.hasChildNodes() ? hydrate : mount;
renderFixture(App, { target });
