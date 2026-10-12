import { hydrate } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("Date fixture mount absent");
hydrate(App, { target });
